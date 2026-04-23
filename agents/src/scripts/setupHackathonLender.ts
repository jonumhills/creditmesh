/**
 * setupHackathonLender.ts
 *
 * One-shot script to:
 *   1. Register 0xAA7164...4946 as a LENDER ("ManojLender") on BancoProtocol
 *   2. Run KYA to write trust score onchain
 *   3. Deposit OKB from that wallet into LoanEscrow + set lending terms
 *   4. Use Choki-Borrower to request a loan from ManojLender
 *   5. Repay the loan
 *
 * Prerequisites:
 *   - Add HACKATHON_LENDER_PRIVATE_KEY=0x... to your .env
 *   - ManojLender wallet (0xAA7164...4946) must have ≥0.025 OKB on X Layer testnet
 *
 * Run:
 *   npx tsx agents/src/scripts/setupHackathonLender.ts
 */

import { ethers } from "ethers";
import axios from "axios";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const API_BASE    = process.env.BACKEND_URL || "http://localhost:3001";
const TESTNET_RPC = process.env.XLAYER_TESTNET_RPC_URL || "https://testrpc.xlayer.tech";
const EXPLORER    = "https://www.oklink.com/xlayer-test/tx";

const LENDER_ADDRESS  = "0xAA7164f726ec646b3b38FE7cCc7C4CCF80514946";
const BORROWER_ADDRESS = "0xAC117C56e6Bcb662aa21331351c35A09Df1B36cf"; // Choki-Borrower

// Lending parameters
const DEPOSIT_ETH      = "0.02";
const MAX_LOAN_ETH     = "0.01";
const MIN_BORROW_SCORE = 41;
const INTEREST_BPS     = 500;        // 5% APR
const MAX_DURATION_SEC = 30 * 86400; // 30 days

// Loan parameters
const LOAN_AMOUNT_ETH   = "0.005";
const LOAN_DURATION_HRS = 6;

const LOAN_ESCROW_ABI = [
  "function deposit() external payable",
  "function setTerms(uint256 maxLoanSize, uint8 minBorrowerScore, uint256 interestRateBps, uint256 maxDurationSeconds) external",
  "function lenderTerms(address) external view returns (address lender, uint256 availableLiquidity, uint256 maxLoanSize, uint8 minBorrowerScore, uint256 interestRateBps, uint256 maxDurationSeconds, bool active)",
  "function getActiveLenders() external view returns (address[])",
];

const api = axios.create({ baseURL: `${API_BASE}/api`, timeout: 60_000 });

function txLink(hash: string) {
  return `${EXPLORER}/${hash}`;
}

// ─── Step 1: Register ────────────────────────────────────────────────────────

async function registerLender(): Promise<void> {
  console.log("\n── Step 1: Register ManojLender ──────────────────────────────");
  try {
    const res = await api.post("/kya/register", {
      wallet: LENDER_ADDRESS,
      role: "LENDER",
      name: "ManojLender",
    });
    console.log(`✓ Registered — ${res.data.message || "OK"}`);
  } catch (err: any) {
    const msg = err.response?.data?.error || err.message;
    if (msg?.toLowerCase().includes("already")) {
      console.log("⏭  Already registered");
    } else {
      throw new Error(`Register failed: ${msg}`);
    }
  }
}

// ─── Step 2: KYA ─────────────────────────────────────────────────────────────

async function runKYA(): Promise<number> {
  console.log("\n── Step 2: Run KYA ───────────────────────────────────────────");
  const res = await api.post("/kya/score", { wallet: LENDER_ADDRESS });
  const score = res.data?.total ?? 0;
  const tier  = res.data?.tier ?? "—";
  console.log(`✓ Trust score: ${score} / 100  (${tier})`);
  if (score < 61) {
    console.warn(`⚠  Score ${score} < 61 — lender needs MEDIUM tier or above. Continuing anyway.`);
  }
  return score;
}

// ─── Step 3: Deposit + set terms (lender signs directly) ─────────────────────

async function depositAndSetTerms(): Promise<void> {
  console.log("\n── Step 3: Deposit OKB + set lending terms ───────────────────");

  const pk = process.env.HACKATHON_LENDER_PRIVATE_KEY;
  if (!pk) throw new Error("HACKATHON_LENDER_PRIVATE_KEY not set in .env");

  const escrowAddr = process.env.LOAN_ESCROW_ADDRESS;
  if (!escrowAddr) throw new Error("LOAN_ESCROW_ADDRESS not set in .env");

  const provider = new ethers.JsonRpcProvider(TESTNET_RPC);
  const signer   = new ethers.Wallet(pk, provider);

  if (signer.address.toLowerCase() !== LENDER_ADDRESS.toLowerCase()) {
    throw new Error(
      `Private key resolves to ${signer.address}, expected ${LENDER_ADDRESS}. Check HACKATHON_LENDER_PRIVATE_KEY.`
    );
  }

  const balance = await provider.getBalance(signer.address);
  console.log(`  Wallet balance: ${ethers.formatEther(balance)} OKB`);

  const depositWei = ethers.parseEther(DEPOSIT_ETH);
  if (balance < depositWei + ethers.parseEther("0.005")) {
    throw new Error(`Insufficient balance. Need ≥${parseFloat(DEPOSIT_ETH) + 0.005} OKB, have ${ethers.formatEther(balance)}`);
  }

  const escrow = new ethers.Contract(escrowAddr, LOAN_ESCROW_ABI, signer);

  // Check if already deposited
  const terms = await escrow.lenderTerms(signer.address);
  if (terms.availableLiquidity > 0n) {
    console.log(`⏭  Already deposited — liquidity: ${ethers.formatEther(terms.availableLiquidity)} OKB`);
  } else {
    const depositTx = await escrow.deposit({ value: depositWei });
    await depositTx.wait();
    console.log(`✓ Deposited ${DEPOSIT_ETH} OKB`);
    console.log(`  TX: ${txLink(depositTx.hash)}`);
  }

  const termsTx = await escrow.setTerms(
    ethers.parseEther(MAX_LOAN_ETH),
    MIN_BORROW_SCORE,
    INTEREST_BPS,
    MAX_DURATION_SEC,
  );
  await termsTx.wait();
  console.log(`✓ Terms set — minScore: ${MIN_BORROW_SCORE}, rate: ${INTEREST_BPS / 100}% APR, maxLoan: ${MAX_LOAN_ETH} OKB`);
  console.log(`  TX: ${txLink(termsTx.hash)}`);
}

// ─── Step 4: Borrow from ManojLender ─────────────────────────────────────────

async function requestLoan(): Promise<number> {
  console.log("\n── Step 4: Choki-Borrower requests loan from ManojLender ─────");

  const res = await api.post("/loans/request", {
    borrower:      BORROWER_ADDRESS,
    amountEth:     LOAN_AMOUNT_ETH,
    durationHours: LOAN_DURATION_HRS,
    purpose:       "Hackathon demo loan — yield farming on X Layer DEX",
  });

  if (!res.data?.success) {
    throw new Error(`Loan request failed: ${res.data?.error || "unknown error"}`);
  }

  const { loanId, match } = res.data;
  console.log(`✓ Loan #${loanId} created`);
  console.log(`  Lender:    ${match.lender}`);
  console.log(`  Principal: ${match.principal} OKB`);
  console.log(`  Rate:      ${match.interestPct}% APR`);
  console.log(`  Duration:  ${match.durationHours}h`);
  return loanId;
}

// ─── Step 5: Repay ───────────────────────────────────────────────────────────

async function repayLoan(loanId: number): Promise<void> {
  console.log(`\n── Step 5: Repay loan #${loanId} ──────────────────────────────`);

  // Brief pause so the loan is fully indexed onchain
  await new Promise((r) => setTimeout(r, 2000));

  const res = await api.post(`/loans/${loanId}/repay`);
  if (!res.data?.success) {
    throw new Error(`Repayment failed: ${res.data?.error || "unknown"}`);
  }
  console.log(`✓ Loan #${loanId} marked REPAID`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔════════════════════════════════════════════════╗");
  console.log("║    BancoProtocol — Hackathon Demo Lender Setup ║");
  console.log("╚════════════════════════════════════════════════╝");
  console.log(`\nLender:   ${LENDER_ADDRESS}  (ManojLender)`);
  console.log(`Borrower: ${BORROWER_ADDRESS}  (Choki-Borrower)`);
  console.log(`Backend:  ${API_BASE}`);

  try {
    await registerLender();
    await runKYA();
    await depositAndSetTerms();
    const loanId = await requestLoan();
    await repayLoan(loanId);

    console.log("\n══════════════════════════════════════════════════");
    console.log("✅  All done! ManojLender is live on BancoProtocol.");
    console.log(`   Dashboard: https://bancoprotocol.vercel.app`);
    console.log(`   Explorer:  https://www.oklink.com/xlayer-test/address/${LENDER_ADDRESS}`);
  } catch (err: any) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}

main();
