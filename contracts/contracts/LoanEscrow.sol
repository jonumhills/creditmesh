// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ITrustScore {
    function getScore(address agent) external view returns (uint8);
    function recordLoan(address agent, uint256 loanId) external;
    function recordRepayment(address agent, uint256 loanId, bool onTime) external;
    function recordDefault(address agent, uint256 loanId) external;
}

interface IAgentRegistry {
    function isKYAApproved(address wallet) external view returns (bool);
    function getRole(address wallet) external view returns (uint8);
}

/// @title LoanEscrow
/// @notice Holds lender USDC liquidity and manages the loan lifecycle on Arc.
///         Loan disbursement and repayment are routed via Circle Nanopayments offchain;
///         this contract tracks state and enforces trust score requirements.
contract LoanEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    ITrustScore public trustScore;
    IAgentRegistry public agentRegistry;

    uint256 public nextLoanId;

    enum LoanStatus { PENDING, ACTIVE, REPAID, DEFAULTED, CANCELLED }

    struct LenderTerms {
        address lender;
        uint256 availableLiquidity;   // USDC (6 decimals)
        uint256 maxLoanSize;          // USDC (6 decimals)
        uint8   minBorrowerScore;
        uint256 interestRateBps;      // basis points (e.g. 500 = 5%)
        uint256 maxDurationSeconds;
        bool    active;
    }

    struct Loan {
        uint256 id;
        address lender;
        address borrower;
        uint256 principal;            // USDC (6 decimals)
        uint256 interestBps;
        uint256 startTime;
        uint256 dueTime;
        uint256 repaidAmount;
        LoanStatus status;
    }

    mapping(address => LenderTerms) public lenderTerms;
    mapping(uint256 => Loan) public loans;
    mapping(address => uint256[]) public borrowerLoans;
    mapping(address => uint256[]) public lenderLoans;

    address[] public activeLenders;

    event LenderDeposited(address indexed lender, uint256 amount);
    event LenderWithdrew(address indexed lender, uint256 amount);
    event LenderTermsSet(address indexed lender, uint8 minScore, uint256 interestBps);
    event LoanCreated(uint256 indexed loanId, address indexed lender, address indexed borrower, uint256 principal);
    event LoanRepaid(uint256 indexed loanId, address indexed borrower, uint256 amount, bool onTime);
    event LoanDefaulted(uint256 indexed loanId, address indexed borrower);

    constructor(address _trustScore, address _agentRegistry, address _usdc) Ownable(msg.sender) {
        trustScore = ITrustScore(_trustScore);
        agentRegistry = IAgentRegistry(_agentRegistry);
        usdc = IERC20(_usdc);
    }

    // ─── Lender Functions ───────────────────────────────────────────────────

    /// @notice Lender deposits USDC liquidity into escrow.
    ///         Caller must approve this contract for `amount` USDC beforehand.
    function deposit(uint256 amount) external nonReentrant {
        require(agentRegistry.isKYAApproved(msg.sender), "KYA not approved");
        require(agentRegistry.getRole(msg.sender) == 1, "Not a lender"); // Role.LENDER = 1
        require(amount > 0, "Zero deposit");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        lenderTerms[msg.sender].lender = msg.sender;
        lenderTerms[msg.sender].availableLiquidity += amount;
        lenderTerms[msg.sender].active = true;

        if (lenderTerms[msg.sender].maxLoanSize == 0) {
            lenderTerms[msg.sender].maxLoanSize = amount;
            lenderTerms[msg.sender].minBorrowerScore = 61;
            lenderTerms[msg.sender].interestRateBps = 500; // 5% default
            lenderTerms[msg.sender].maxDurationSeconds = 30 days;
        }

        _addActiveLender(msg.sender);
        emit LenderDeposited(msg.sender, amount);
    }

    /// @notice Lender sets their loan terms.
    function setTerms(
        uint256 maxLoanSize,
        uint8   minBorrowerScore,
        uint256 interestRateBps,
        uint256 maxDurationSeconds
    ) external {
        require(agentRegistry.isKYAApproved(msg.sender), "KYA not approved");
        require(minBorrowerScore >= 41, "Min score too low");
        require(interestRateBps <= 5000, "Interest too high (>50%)");

        LenderTerms storage t = lenderTerms[msg.sender];
        t.maxLoanSize = maxLoanSize;
        t.minBorrowerScore = minBorrowerScore;
        t.interestRateBps = interestRateBps;
        t.maxDurationSeconds = maxDurationSeconds;

        emit LenderTermsSet(msg.sender, minBorrowerScore, interestRateBps);
    }

    /// @notice Lender withdraws available (not locked) USDC liquidity.
    function withdraw(uint256 amount) external nonReentrant {
        LenderTerms storage t = lenderTerms[msg.sender];
        require(t.availableLiquidity >= amount, "Insufficient liquidity");
        t.availableLiquidity -= amount;
        if (t.availableLiquidity == 0) t.active = false;

        usdc.safeTransfer(msg.sender, amount);
        emit LenderWithdrew(msg.sender, amount);
    }

    // ─── Loan Lifecycle ─────────────────────────────────────────────────────

    /// @notice Platform creates a loan after offchain matchmaking.
    ///         Funds are disbursed via Circle Nanopayments offchain; this records state.
    function createLoan(
        address lender,
        address borrower,
        uint256 principal,
        uint256 durationSeconds
    ) external onlyOwner nonReentrant returns (uint256 loanId) {
        require(agentRegistry.isKYAApproved(borrower), "Borrower KYA not approved");
        LenderTerms storage t = lenderTerms[lender];
        require(t.active, "Lender not active");
        require(principal <= t.maxLoanSize, "Exceeds max loan size");
        require(principal <= t.availableLiquidity, "Insufficient lender liquidity");
        require(trustScore.getScore(borrower) >= t.minBorrowerScore, "Borrower score too low");
        require(durationSeconds <= t.maxDurationSeconds, "Duration too long");

        loanId = nextLoanId++;

        loans[loanId] = Loan({
            id:           loanId,
            lender:       lender,
            borrower:     borrower,
            principal:    principal,
            interestBps:  t.interestRateBps,
            startTime:    block.timestamp,
            dueTime:      block.timestamp + durationSeconds,
            repaidAmount: 0,
            status:       LoanStatus.ACTIVE
        });

        t.availableLiquidity -= principal;
        borrowerLoans[borrower].push(loanId);
        lenderLoans[lender].push(loanId);

        trustScore.recordLoan(borrower, loanId);

        emit LoanCreated(loanId, lender, borrower, principal);
    }

    /// @notice Record repayment after Circle Nanopayments confirmation offchain.
    function recordRepayment(uint256 loanId) external onlyOwner {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.ACTIVE, "Loan not active");

        bool onTime = block.timestamp <= loan.dueTime;
        uint256 totalDue = loan.principal + (loan.principal * loan.interestBps) / 10000;

        loan.repaidAmount = totalDue;
        loan.status = LoanStatus.REPAID;

        // Return principal + interest to lender liquidity pool
        lenderTerms[loan.lender].availableLiquidity += totalDue;

        trustScore.recordRepayment(loan.borrower, loanId, onTime);

        emit LoanRepaid(loanId, loan.borrower, totalDue, onTime);
    }

    /// @notice Mark a loan as defaulted (called by platform after deadline passes).
    function markDefault(uint256 loanId) external onlyOwner {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.ACTIVE, "Loan not active");
        require(block.timestamp > loan.dueTime, "Deadline not passed");

        loan.status = LoanStatus.DEFAULTED;
        trustScore.recordDefault(loan.borrower, loanId);

        emit LoanDefaulted(loanId, loan.borrower);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    function getBorrowerLoans(address borrower) external view returns (uint256[] memory) {
        return borrowerLoans[borrower];
    }

    function getLenderLoans(address lender) external view returns (uint256[] memory) {
        return lenderLoans[lender];
    }

    function getActiveLenders() external view returns (address[] memory) {
        return activeLenders;
    }

    function getTotalDue(uint256 loanId) external view returns (uint256) {
        Loan memory loan = loans[loanId];
        return loan.principal + (loan.principal * loan.interestBps) / 10000;
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _addActiveLender(address lender) internal {
        for (uint256 i = 0; i < activeLenders.length; i++) {
            if (activeLenders[i] == lender) return;
        }
        activeLenders.push(lender);
    }
}
