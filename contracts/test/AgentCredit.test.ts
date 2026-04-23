import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentRegistry, TrustScore, LoanEscrow } from "../typechain-types";

describe("AgentCredit Contracts", function () {
  let registry: AgentRegistry;
  let trustScore: TrustScore;
  let loanEscrow: LoanEscrow;
  let owner: any, lender: any, borrower: any;

  beforeEach(async function () {
    [owner, lender, borrower] = await ethers.getSigners();

    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    registry = await AgentRegistry.deploy();

    const TrustScore = await ethers.getContractFactory("TrustScore");
    trustScore = await TrustScore.deploy();

    const LoanEscrow = await ethers.getContractFactory("LoanEscrow");
    loanEscrow = await LoanEscrow.deploy(
      await trustScore.getAddress(),
      await registry.getAddress()
    );

    // Authorize LoanEscrow to write trust scores
    await trustScore.authorize(await loanEscrow.getAddress());
  });

  describe("AgentRegistry", function () {
    it("should register a lender", async function () {
      await registry.register(lender.address, 1); // Role.LENDER
      const agent = await registry.getAgent(lender.address);
      expect(agent.role).to.equal(1);
      expect(agent.active).to.be.true;
    });

    it("should register a borrower", async function () {
      await registry.register(borrower.address, 2); // Role.BORROWER
      const agent = await registry.getAgent(borrower.address);
      expect(agent.role).to.equal(2);
    });

    it("should prevent double registration", async function () {
      await registry.register(lender.address, 1);
      await expect(registry.register(lender.address, 1)).to.be.revertedWith("Already registered");
    });

    it("should mark KYA passed", async function () {
      await registry.register(lender.address, 1);
      await registry.markKYAPassed(lender.address);
      expect(await registry.isKYAApproved(lender.address)).to.be.true;
    });
  });

  describe("TrustScore", function () {
    it("should set and get a score", async function () {
      await trustScore.setScore(borrower.address, 75);
      expect(await trustScore.getScore(borrower.address)).to.equal(75);
    });

    it("should increase score on repayment", async function () {
      await trustScore.setScore(borrower.address, 70);
      await trustScore.recordLoan(borrower.address, 1);
      await trustScore.recordRepayment(borrower.address, 1, true);
      expect(await trustScore.getScore(borrower.address)).to.equal(75);
    });

    it("should decrease score on default", async function () {
      await trustScore.setScore(borrower.address, 70);
      await trustScore.recordDefault(borrower.address, 1);
      expect(await trustScore.getScore(borrower.address)).to.equal(50);
    });

    it("should return correct access tier", async function () {
      await trustScore.setScore(borrower.address, 85);
      expect(await trustScore.getAccessTier(borrower.address)).to.equal("FULL_ACCESS");

      await trustScore.setScore(borrower.address, 65);
      expect(await trustScore.getAccessTier(borrower.address)).to.equal("MEDIUM");

      await trustScore.setScore(borrower.address, 30);
      expect(await trustScore.getAccessTier(borrower.address)).to.equal("NO_ACCESS");
    });
  });

  describe("LoanEscrow", function () {
    beforeEach(async function () {
      // Register and approve lender
      await registry.register(lender.address, 1);
      await registry.markKYAPassed(lender.address);
      await trustScore.setScore(lender.address, 80);

      // Register and approve borrower
      await registry.register(borrower.address, 2);
      await registry.markKYAPassed(borrower.address);
      await trustScore.setScore(borrower.address, 65);
    });

    it("should allow lender to deposit", async function () {
      await loanEscrow.connect(lender).deposit({ value: ethers.parseEther("1.0") });
      const terms = await loanEscrow.lenderTerms(lender.address);
      expect(terms.availableLiquidity).to.equal(ethers.parseEther("1.0"));
    });

    it("should create a loan when score requirements met", async function () {
      await loanEscrow.connect(lender).deposit({ value: ethers.parseEther("1.0") });
      await loanEscrow.connect(lender).setTerms(
        ethers.parseEther("0.5"),
        61,
        500,
        30 * 24 * 60 * 60
      );

      await loanEscrow.createLoan(
        lender.address,
        borrower.address,
        ethers.parseEther("0.1"),
        7 * 24 * 60 * 60
      );

      const loan = await loanEscrow.getLoan(0);
      expect(loan.status).to.equal(1); // LoanStatus.ACTIVE
      expect(loan.borrower).to.equal(borrower.address);
    });

    it("should reject loan if borrower score too low", async function () {
      await trustScore.setScore(borrower.address, 50);
      await loanEscrow.connect(lender).deposit({ value: ethers.parseEther("1.0") });
      await loanEscrow.connect(lender).setTerms(
        ethers.parseEther("0.5"),
        65, // requires 65, borrower only has 50
        500,
        30 * 24 * 60 * 60
      );

      await expect(
        loanEscrow.createLoan(
          lender.address,
          borrower.address,
          ethers.parseEther("0.1"),
          7 * 24 * 60 * 60
        )
      ).to.be.revertedWith("Borrower score too low");
    });
  });
});
