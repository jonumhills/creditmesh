/**
 * bootstrapAgents.ts
 *
 * One-time setup for all 11 agents on Arc:
 *   1. Register on AgentRegistry (onchain, via platform API)
 *   2. Run KYA — compute + write trust score onchain
 *   3. LENDERS: approve USDC + deposit liquidity + set terms on LoanEscrow
 *
 * Updates agents.json with registered/kyaPassed/trustScore state.
 *
 * Run: npm run agents:bootstrap
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import * as dotenv from "dotenv";
dotenv.config({ path: require("path").join(__dirname, "../../../.env") });

import { LENDER_CONFIGS } from "../config/agents.config";

const AGENTS_FILE  = path.join(__dirname, "../../agents.json");
const API_BASE     = process.env.BACKEND_URL || "http://localhost:3001";
const TESTNET_RPC  = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const USDC_DECIMALS = 6;

const api = axios.create({ baseURL: `${API_BASE}/api`, timeout: 30000 });

const LOAN_ESCROW_ABI = [
  "function deposit(uint256 amount) external",
  "function setTerms(uint256 maxLoanSize, uint8 minBorrowerScore, uint256 interestRateBps, uint256 maxDurationSeconds) external",
  "function lenderTerms(address) external view returns (address lender, uint256 availableLiquidity, uint256 maxLoanSize, uint8 minBorrowerScore, uint256 interestRateBps, uint256 maxDurationSeconds, bool active)",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
];

function loadAgents() {
  if (!fs.existsSync(AGENTS_FILE)) {
    console.error("❌ agents.json not found — run npm run agents:create first");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(AGENTS_FILE, "utf-8"));
}

function saveAgents(agents: any[]) {
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(agents, null, 2));
}

// ── Step 1: Register ──────────────────────────────────────────────────────────

async function registerAgent(wallet: string, role: string): Promise<boolean> {
  try {
    const res = await api.post("/kya/register", { wallet, role });
    return res.data?.success === true;
  } catch (err: any) {
    const msg = err.response?.data?.error || err.message;
    if (msg?.includes("Already registered")) return true;
    console.log(`    ⚠ Register failed: ${msg}`);
    return false;
  }
}

// ── Step 2: KYA ───────────────────────────────────────────────────────────────

async function runKYA(wallet: string): Promise<number> {
  try {
    const res = await api.post("/kya/score", { wallet });
    return res.data?.total ?? 0;
  } catch (err: any) {
    console.log(`    ⚠ KYA failed: ${err.response?.data?.error || err.message}`);
    return 0;
  }
}

// ── Step 3: Lender approve USDC + deposit + set terms ────────────────────────

async function depositAndSetTerms(agent: any): Promise<boolean> {
  const config = LENDER_CONFIGS.find((c) => c.id === agent.id);
  if (!config) return false;

  const usdcAddress  = process.env.USDC_TOKEN_ADDRESS;
  const escrowAddr   = process.env.LOAN_ESCROW_ADDRESS;
  if (!usdcAddress) throw new Error("USDC_TOKEN_ADDRESS not set");
  if (!escrowAddr)  throw new Error("LOAN_ESCROW_ADDRESS not set");

  // Circle wallets don't expose a private key — skip onchain deposit for them
  if (!agent.wallet.privateKey) {
    console.log(`    ⚠ No private key (Circle-managed wallet) — deposit must be done via Circle API`);
    return false;
  }

  const provider   = new ethers.JsonRpcProvider(TESTNET_RPC);
  const signer     = new ethers.Wallet(agent.wallet.privateKey, provider);
  const escrow     = new ethers.Contract(escrowAddr, LOAN_ESCROW_ABI, signer);
  const usdcToken  = new ethers.Contract(usdcAddress, ERC20_ABI, signer);

  const depositAmount = ethers.parseUnits(config.goals.depositAmountUsdc, USDC_DECIMALS);

  const usdcBalance = await usdcToken.balanceOf(signer.address);
  if (usdcBalance < depositAmount) {
    console.log(`    ⚠ Insufficient USDC (${ethers.formatUnits(usdcBalance, USDC_DECIMALS)}) for deposit of ${config.goals.depositAmountUsdc}`);
    return false;
  }

  // Check if already deposited
  const terms = await escrow.lenderTerms(signer.address);
  if (terms.availableLiquidity > 0n) {
    console.log(`    ⏭  Already deposited — liquidity: ${ethers.formatUnits(terms.availableLiquidity, USDC_DECIMALS)} USDC`);
    return true;
  }

  // Approve LoanEscrow to spend USDC
  console.log(`    → Approving ${config.goals.depositAmountUsdc} USDC for LoanEscrow...`);
  const allowance = await usdcToken.allowance(signer.address, escrowAddr);
  if (allowance < depositAmount) {
    const approveTx = await usdcToken.approve(escrowAddr, depositAmount);
    await approveTx.wait();
    console.log(`    ✓ Approved — tx: ${approveTx.hash}`);
  } else {
    console.log(`    ⏭  Allowance already sufficient`);
  }

  // Deposit USDC
  console.log(`    → Depositing ${config.goals.depositAmountUsdc} USDC...`);
  const depositTx = await escrow.deposit(depositAmount);
  await depositTx.wait();
  console.log(`    ✓ Deposited — tx: ${depositTx.hash}`);

  // Set terms
  console.log(`    → Setting terms (minScore: ${config.goals.minBorrowerScore}, rate: ${config.goals.interestRateBps}bps)...`);
  const termsTx = await escrow.setTerms(
    ethers.parseUnits(config.goals.maxLoanSizeUsdc, USDC_DECIMALS),
    config.goals.minBorrowerScore,
    config.goals.interestRateBps,
    config.goals.maxDurationDays * 24 * 60 * 60
  );
  await termsTx.wait();
  console.log(`    ✓ Terms set — tx: ${termsTx.hash}`);
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║    CreditMesh — Bootstrap Agents      ║");
  console.log("╚══════════════════════════════════════╝\n");

  const agents = loadAgents();

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    console.log(`\n[${i + 1}/${agents.length}] ${agent.name} (${agent.role}) — ${agent.wallet.address}`);

    if (!agent.registered) {
      console.log(`  Step 1: Registering...`);
      const ok = await registerAgent(agent.wallet.address, agent.role);
      if (ok) {
        agents[i].registered = true;
        saveAgents(agents);
        console.log(`  ✓ Registered as ${agent.role}`);
      }
    } else {
      console.log(`  Step 1: ⏭  Already registered`);
    }

    if (!agent.kyaPassed) {
      console.log(`  Step 2: Running KYA...`);
      const score = await runKYA(agent.wallet.address);
      agents[i].trustScore = score;
      if (score >= 41) {
        agents[i].kyaPassed = true;
        console.log(`  ✓ KYA passed — trust score: ${score}`);
      } else {
        console.log(`  ✗ KYA score too low: ${score} (need ≥41)`);
      }
      saveAgents(agents);
    } else {
      console.log(`  Step 2: ⏭  KYA already passed (score: ${agent.trustScore})`);
    }

    if (agent.role === "LENDER" && agent.kyaPassed) {
      console.log(`  Step 3: Deposit + set terms...`);
      try {
        await depositAndSetTerms(agent);
      } catch (err: any) {
        console.log(`  ✗ Deposit failed: ${err.message}`);
      }
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log("\n── Bootstrap Complete ──────────────────────────────────────────");
  console.log("Name               Role       Score  KYA    Registered");
  console.log("─────────────────────────────────────────────────────────");
  for (const a of agents) {
    const score = String(a.trustScore).padStart(5);
    const kya   = a.kyaPassed  ? "✓" : "✗";
    const reg   = a.registered ? "✓" : "✗";
    console.log(`${a.name.padEnd(18)} ${a.role.padEnd(10)} ${score}  ${kya}      ${reg}`);
  }
  console.log("\nNext: npm run agents:start\n");
}

main().catch(console.error);
