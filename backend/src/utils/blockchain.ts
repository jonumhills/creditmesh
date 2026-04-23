import { ethers } from "ethers";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(__dirname, "../../../.env") });

export const AGENT_REGISTRY_ABI = [
  "function register(address wallet, uint8 role) external",
  "function markKYAPassed(address wallet) external",
  "function isKYAApproved(address wallet) external view returns (bool)",
  "function getRole(address wallet) external view returns (uint8)",
  "function getAgent(address wallet) external view returns (tuple(uint8 role, address wallet, uint256 registeredAt, bool kycPassed, bool active))",
  "function getAllAgents() external view returns (address[])",
  "function getTotalAgents() external view returns (uint256)",
  "event AgentRegistered(address indexed wallet, uint8 role, uint256 timestamp)",
];

export const TRUST_SCORE_ABI = [
  "function setScore(address agent, uint8 newScore) external",
  "function getScore(address agent) external view returns (uint8)",
  "function getFullScore(address agent) external view returns (tuple(uint8 value, uint256 lastUpdated, uint256 loanCount, uint256 repaidCount, uint256 defaultCount))",
  "function getAccessTier(address agent) external view returns (string)",
  "function canParticipate(address agent) external view returns (bool)",
  "function canLend(address agent) external view returns (bool)",
  "event ScoreUpdated(address indexed agent, uint8 oldScore, uint8 newScore, uint256 timestamp)",
];

// deposit(uint256) — no longer payable; lender pre-approves USDC and calls deposit(amount)
export const LOAN_ESCROW_ABI = [
  "function deposit(uint256 amount) external",
  "function setTerms(uint256 maxLoanSize, uint8 minBorrowerScore, uint256 interestRateBps, uint256 maxDurationSeconds) external",
  "function withdraw(uint256 amount) external",
  "function createLoan(address lender, address borrower, uint256 principal, uint256 durationSeconds) external returns (uint256)",
  "function recordRepayment(uint256 loanId) external",
  "function markDefault(uint256 loanId) external",
  "function getLoan(uint256 loanId) external view returns (tuple(uint256 id, address lender, address borrower, uint256 principal, uint256 interestBps, uint256 startTime, uint256 dueTime, uint256 repaidAmount, uint8 status))",
  "function getBorrowerLoans(address borrower) external view returns (uint256[])",
  "function getLenderLoans(address lender) external view returns (uint256[])",
  "function getActiveLenders() external view returns (address[])",
  "function getTotalDue(uint256 loanId) external view returns (uint256)",
  "function lenderTerms(address) external view returns (address lender, uint256 availableLiquidity, uint256 maxLoanSize, uint8 minBorrowerScore, uint256 interestRateBps, uint256 maxDurationSeconds, bool active)",
  "function nextLoanId() external view returns (uint256)",
  "event LoanCreated(uint256 indexed loanId, address indexed lender, address indexed borrower, uint256 principal)",
  "event LoanRepaid(uint256 indexed loanId, address indexed borrower, uint256 amount, bool onTime)",
  "event LoanDefaulted(uint256 indexed loanId, address indexed borrower)",
];

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function decimals() external view returns (uint8)",
];

export function getProvider(): ethers.JsonRpcProvider {
  const rpcUrl = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
  return new ethers.JsonRpcProvider(rpcUrl);
}

export function getSigner(): ethers.Wallet {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY not set");
  return new ethers.Wallet(pk, getProvider());
}

export function getRegistryContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  const address = process.env.AGENT_REGISTRY_ADDRESS;
  if (!address) throw new Error("AGENT_REGISTRY_ADDRESS not set");
  return new ethers.Contract(address, AGENT_REGISTRY_ABI, signerOrProvider || getProvider());
}

export function getTrustScoreContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  const address = process.env.TRUST_SCORE_ADDRESS;
  if (!address) throw new Error("TRUST_SCORE_ADDRESS not set");
  return new ethers.Contract(address, TRUST_SCORE_ABI, signerOrProvider || getProvider());
}

export function getLoanEscrowContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  const address = process.env.LOAN_ESCROW_ADDRESS;
  if (!address) throw new Error("LOAN_ESCROW_ADDRESS not set");
  return new ethers.Contract(address, LOAN_ESCROW_ABI, signerOrProvider || getProvider());
}

export function getUsdcContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  const address = process.env.USDC_TOKEN_ADDRESS;
  if (!address) throw new Error("USDC_TOKEN_ADDRESS not set");
  return new ethers.Contract(address, ERC20_ABI, signerOrProvider || getProvider());
}

// USDC has 6 decimals — use these helpers everywhere instead of parseEther/formatEther
export const parseUsdc  = (amount: string) => ethers.parseUnits(amount, 6);
export const formatUsdc = (amount: bigint)  => ethers.formatUnits(amount, 6);
