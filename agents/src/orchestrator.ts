/**
 * orchestrator.ts
 *
 * Runs all 11 agents on an hourly cycle using Claude API + tool use.
 * Each agent is autonomous — it reads its own state and decides what to do.
 *
 * Lender cycle (every 60 min):
 *   - Check USDC liquidity in LoanEscrow
 *   - Top up deposit (approve USDC + deposit) if below threshold
 *   - Log active loans and earnings
 *
 * Borrower cycle (every 60 min):
 *   - Check if active loan exists
 *   - If no loan → request a new one
 *   - If loan due within 2h → repay it
 *   - Log decision and reasoning
 *
 * Run: npm run agents:start
 */

import Anthropic from "@anthropic-ai/sdk";
import { ethers }  from "ethers";
import * as fs     from "fs";
import * as path   from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: require("path").join(__dirname, "../../.env") });

import { LENDER_CONFIGS, BORROWER_CONFIGS } from "./config/agents.config";

const AGENTS_FILE = path.join(__dirname, "../agents.json");
const STATE_FILE  = path.join(__dirname, "../orchestrator-state.json");
const API_BASE    = process.env.BACKEND_URL || "http://localhost:3001";
const TESTNET_RPC = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const CYCLE_MS    = 10 * 60 * 1000;   // 10 minutes per cycle
const USDC_DECIMALS = 6;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const provider  = new ethers.JsonRpcProvider(TESTNET_RPC);

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentRecord {
  id: string;
  name: string;
  role: "LENDER" | "BORROWER";
  wallet: { address: string; privateKey: string };
  registered: boolean;
  kyaPassed: boolean;
  trustScore: number;
}

interface AgentState {
  record:        AgentRecord;
  activeLoanId:  number | null;
  cycleCount:    number;
  lastCycleAt:   string | null;
  totalEarned:   string;   // USDC string
  totalBorrowed: string;
}

import axios from "axios";
const api = axios.create({ baseURL: `${API_BASE}/api`, timeout: 20000 });

// Module-level states ref — shared between tool handlers and orchestrator
let states: AgentState[] = [];

async function apiCall(method: "get" | "post", path: string, data?: object): Promise<any> {
  try {
    const res = method === "get" ? await api.get(path) : await api.post(path, data);
    return res.data;
  } catch (err: any) {
    return { error: err.response?.data?.error || err.message };
  }
}

// ── Lender Agent ──────────────────────────────────────────────────────────────

// ── State Persistence ─────────────────────────────────────────────────────────

function saveState(s: AgentState[]) {
  const snapshot = s.map((st) => ({ id: st.record.id, activeLoanId: st.activeLoanId, cycleCount: st.cycleCount }));
  fs.writeFileSync(STATE_FILE, JSON.stringify(snapshot, null, 2));
}

function loadSavedState(): Map<string, { activeLoanId: number | null; cycleCount: number }> {
  if (!fs.existsSync(STATE_FILE)) return new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as Array<{ id: string; activeLoanId: number | null; cycleCount: number }>;
    return new Map(raw.map((r) => [r.id, { activeLoanId: r.activeLoanId, cycleCount: r.cycleCount }]));
  } catch {
    return new Map();
  }
}

const LOAN_ESCROW_ABI = [
  "function deposit(uint256 amount) external",
  "function setTerms(uint256 maxLoanSize, uint8 minBorrowerScore, uint256 interestRateBps, uint256 maxDurationSeconds) external",
  "function lenderTerms(address) external view returns (address lender, uint256 availableLiquidity, uint256 maxLoanSize, uint8 minBorrowerScore, uint256 interestRateBps, uint256 maxDurationSeconds, bool active)",
  "function getLenderLoans(address lender) external view returns (uint256[])",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
];

function lenderTools(config: typeof LENDER_CONFIGS[0]): Anthropic.Tool[] {
  return [
    {
      name: "check_liquidity",
      description: "Check current available USDC liquidity in LoanEscrow for this lender.",
      input_schema: { type: "object" as const, properties: {}, required: [] },
    },
    {
      name: "top_up_deposit",
      description: "Approve and deposit USDC into LoanEscrow to replenish liquidity.",
      input_schema: {
        type: "object" as const,
        properties: {
          amount_usdc: { type: "string", description: "Amount of USDC to deposit (e.g. '0.005')" },
        },
        required: ["amount_usdc"],
      },
    },
    {
      name: "get_active_loans",
      description: "Get all loan IDs for this lender and their current status.",
      input_schema: { type: "object" as const, properties: {}, required: [] },
    },
    {
      name: "get_trust_score",
      description: "Get current trust score for this lender.",
      input_schema: { type: "object" as const, properties: {}, required: [] },
    },
    {
      name: "log",
      description: "Log a decision or status update.",
      input_schema: {
        type: "object" as const,
        properties: { message: { type: "string" } },
        required: ["message"],
      },
    },
  ];
}

async function handleLenderTool(name: string, input: any, state: AgentState): Promise<string> {
  const { record } = state;
  const escrowAddr = process.env.LOAN_ESCROW_ADDRESS!;
  const usdcAddr   = process.env.USDC_TOKEN_ADDRESS!;

  switch (name) {
    case "check_liquidity": {
      const escrow  = new ethers.Contract(escrowAddr, LOAN_ESCROW_ABI, provider);
      const terms   = await escrow.lenderTerms(record.wallet.address);
      const usdcBal = await new ethers.Contract(usdcAddr, ERC20_ABI, provider)
        .balanceOf(record.wallet.address);
      return JSON.stringify({
        availableLiquidity: ethers.formatUnits(terms.availableLiquidity, USDC_DECIMALS),
        walletUsdcBalance:  ethers.formatUnits(usdcBal, USDC_DECIMALS),
        minBorrowerScore:   Number(terms.minBorrowerScore),
        interestRateBps:    Number(terms.interestRateBps),
        active:             terms.active,
      });
    }
    case "top_up_deposit": {
      if (!record.wallet.privateKey) return JSON.stringify({ error: "No private key (Circle-managed wallet)" });
      try {
        const signer     = new ethers.Wallet(record.wallet.privateKey, provider);
        const escrow     = new ethers.Contract(escrowAddr, LOAN_ESCROW_ABI, signer);
        const usdcToken  = new ethers.Contract(usdcAddr, ERC20_ABI, signer);
        const depositWei = ethers.parseUnits(input.amount_usdc, USDC_DECIMALS);

        const usdcBalance = await usdcToken.balanceOf(signer.address);
        if (usdcBalance < depositWei) {
          return JSON.stringify({ error: `Insufficient USDC: ${ethers.formatUnits(usdcBalance, USDC_DECIMALS)}` });
        }

        // Approve then deposit
        const allowance = await usdcToken.allowance(signer.address, escrowAddr);
        if (allowance < depositWei) {
          const approveTx = await usdcToken.approve(escrowAddr, depositWei);
          await approveTx.wait();
        }
        const depositTx = await escrow.deposit(depositWei);
        await depositTx.wait();
        return JSON.stringify({ success: true, txHash: depositTx.hash, deposited: input.amount_usdc + " USDC" });
      } catch (err: any) {
        return JSON.stringify({ error: `Deposit failed: ${err.shortMessage || err.message?.slice(0, 120)}` });
      }
    }
    case "get_active_loans": {
      const escrow = new ethers.Contract(escrowAddr, LOAN_ESCROW_ABI, provider);
      const ids    = await escrow.getLenderLoans(record.wallet.address);
      const loans  = await Promise.all(
        ids.map(async (id: bigint) => apiCall("get", `/loans/${id.toString()}`))
      );
      return JSON.stringify({ loans, totalLoans: loans.length });
    }
    case "get_trust_score": {
      const data = await apiCall("get", `/kya/score/${record.wallet.address}`);
      return JSON.stringify(data);
    }
    case "log": {
      console.log(`  [${record.name}] ${input.message}`);
      return "logged";
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

async function runLenderCycle(state: AgentState) {
  const { record } = state;
  const config     = LENDER_CONFIGS.find((c) => c.id === record.id)!;

  console.log(`\n  🏦 [${record.name}] Lender cycle #${state.cycleCount + 1}`);

  const system = `You are ${record.name}, an autonomous AI lending agent on CreditMesh (Arc blockchain, USDC).

Your profile:
- Role: LENDER
- Wallet: ${record.wallet.address}
- Trust Score: ${record.trustScore}
- Personality: ${config.personality}
- Target yield: ${config.goals.interestRateBps / 100}% APR
- Min borrower score: ${config.goals.minBorrowerScore}
- Max loan size: ${config.goals.maxLoanSizeUsdc} USDC

Your job this cycle:
1. Check your current USDC liquidity in LoanEscrow
2. If available liquidity < 0.003 USDC, top up with a small deposit
3. Check active loans — note any completed ones
4. Log your current status and any decisions made

Be concise. Make real decisions based on the data.`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: "Run your lending cycle. Check liquidity, review loans, and take any necessary actions." },
  ];

  const tools = lenderTools(config);
  let iterations = 0;

  while (iterations < 8) {
    iterations++;
    const res = await anthropic.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason === "end_turn") break;
    if (res.stop_reason !== "tool_use") break;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      const result = await handleLenderTool(block.name, block.input, state);
      results.push({ type: "tool_result", tool_use_id: block.id, content: result });
    }
    messages.push({ role: "user", content: results });
  }

  state.cycleCount++;
  state.lastCycleAt = new Date().toISOString();
}

// ── Borrower Agent ────────────────────────────────────────────────────────────

function borrowerTools(): Anthropic.Tool[] {
  return [
    {
      name: "get_active_loan",
      description: "Check if this borrower has an active loan and its repayment status.",
      input_schema: { type: "object" as const, properties: {}, required: [] },
    },
    {
      name: "get_available_lenders",
      description: "Get list of active lenders and their terms.",
      input_schema: { type: "object" as const, properties: {}, required: [] },
    },
    {
      name: "request_loan",
      description: "Request a loan from the best available lender. Prefer durationHours for short demo cycles.",
      input_schema: {
        type: "object" as const,
        properties: {
          amount_usdc:    { type: "string" },
          duration_hours: { type: "number", description: "Duration in hours (preferred, e.g. 2)" },
          duration_days:  { type: "number", description: "Duration in days (alternative)" },
          purpose:        { type: "string" },
        },
        required: ["amount_usdc", "purpose"],
      },
    },
    {
      name: "repay_loan",
      description: "Repay an active loan before the deadline.",
      input_schema: {
        type: "object" as const,
        properties: { loan_id: { type: "number" } },
        required: ["loan_id"],
      },
    },
    {
      name: "get_trust_score",
      description: "Get current trust score.",
      input_schema: { type: "object" as const, properties: {}, required: [] },
    },
    {
      name: "get_wallet_balance",
      description: "Check current USDC wallet balance.",
      input_schema: { type: "object" as const, properties: {}, required: [] },
    },
    {
      name: "log",
      description: "Log a decision or status update.",
      input_schema: {
        type: "object" as const,
        properties: { message: { type: "string" } },
        required: ["message"],
      },
    },
  ];
}

async function handleBorrowerTool(name: string, input: any, state: AgentState): Promise<string> {
  const { record } = state;
  const usdcAddr   = process.env.USDC_TOKEN_ADDRESS!;

  switch (name) {
    case "get_active_loan": {
      if (state.activeLoanId === null) return JSON.stringify({ activeLoan: null });
      return JSON.stringify(await apiCall("get", `/loans/${state.activeLoanId}`));
    }
    case "get_available_lenders": {
      return JSON.stringify(await apiCall("get", "/loans/lenders/active"));
    }
    case "request_loan": {
      const body: any = {
        borrower:   record.wallet.address,
        amountUsdc: input.amount_usdc,
        purpose:    input.purpose,
      };
      if (input.duration_hours) body.durationHours = input.duration_hours;
      else body.durationDays = input.duration_days ?? 1;
      const result = await apiCall("post", "/loans/request", body);
      if (result.loanId !== undefined) {
        state.activeLoanId = result.loanId;
        saveState(states);
      }
      return JSON.stringify(result);
    }
    case "repay_loan": {
      const result = await apiCall("post", `/loans/${input.loan_id}/repay`);
      if (result.success) {
        state.activeLoanId = null;
        saveState(states);
      }
      return JSON.stringify(result);
    }
    case "get_trust_score": {
      const data = await apiCall("get", `/kya/score/${record.wallet.address}`);
      if (data.score) state.record.trustScore = data.score;
      return JSON.stringify(data);
    }
    case "get_wallet_balance": {
      const usdcToken = new ethers.Contract(usdcAddr, ERC20_ABI, provider);
      const balance   = await usdcToken.balanceOf(record.wallet.address);
      return JSON.stringify({ balanceUsdc: ethers.formatUnits(balance, USDC_DECIMALS) });
    }
    case "log": {
      console.log(`  [${record.name}] ${input.message}`);
      return "logged";
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

async function runBorrowerCycle(state: AgentState) {
  const { record } = state;
  const config     = BORROWER_CONFIGS.find((c) => c.id === record.id)!;

  console.log(`\n  💳 [${record.name}] Borrower cycle #${state.cycleCount + 1}`);

  const system = `You are ${record.name}, an autonomous AI borrower agent on CreditMesh (Arc blockchain, USDC).

Your profile:
- Role: BORROWER
- Wallet: ${record.wallet.address}
- Trust Score: ${record.trustScore}
- Personality: ${config.personality}
- Preferred loan: ${config.goals.loanAmountUsdc} USDC for ${config.goals.preferredDurationDays} day(s)
- Max rate: ${config.goals.maxInterestRateBps / 100}% APR
- Purpose: ${config.goals.purpose}
- Active loan ID: ${state.activeLoanId ?? "none"}

Your job this cycle:
1. Check wallet USDC balance and current trust score
2. If you have an active loan:
   - Repay it NOW (call repay_loan) — fast repayment builds credit history and frees up capital
   - After repaying, immediately request a new loan if you have sufficient balance
3. If no active loan:
   - Check available lenders
   - If a lender's rate is ≤ your max rate AND your score qualifies → request a loan (prefer durationHours: 2 for quick cycles)
   - If no suitable lender → log and wait
4. Always explain your reasoning

Repay loans aggressively — every successful repayment improves your trust score.`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: "Run your borrowing cycle. Check your status and take the right action." },
  ];

  let iterations = 0;
  while (iterations < 10) {
    iterations++;
    const res = await anthropic.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 384,
      system,
      tools:      borrowerTools(),
      messages,
    });

    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason === "end_turn") break;
    if (res.stop_reason !== "tool_use") break;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      const result = await handleBorrowerTool(block.name, block.input, state);
      results.push({ type: "tool_result", tool_use_id: block.id, content: result });
    }
    messages.push({ role: "user", content: results });
  }

  state.cycleCount++;
  state.lastCycleAt = new Date().toISOString();
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

async function runCycle(states: AgentState[]) {
  const now = new Date().toISOString();
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  CreditMesh Orchestrator — ${now}`);
  console.log(`  Running ${states.length} agents on Arc`);
  console.log(`${"═".repeat(60)}`);

  const lenders   = states.filter((s) => s.record.role === "LENDER");
  const borrowers = states.filter((s) => s.record.role === "BORROWER");

  console.log(`\n── Lenders (${lenders.length}) ─────────────────────────────────`);
  for (const state of lenders) {
    try { await runLenderCycle(state); } catch (e: any) { console.error(`  [${state.record.name}] cycle error: ${e.message?.slice(0, 80)}`); }
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\n── Borrowers (${borrowers.length}) ───────────────────────────────`);
  for (const state of borrowers) {
    try { await runBorrowerCycle(state); } catch (e: any) { console.error(`  [${state.record.name}] cycle error: ${e.message?.slice(0, 80)}`); }
    await new Promise((r) => setTimeout(r, 2000));
  }

  saveState(states);
  console.log(`\n✅ Cycle complete. Next run in ${CYCLE_MS / 60000} minutes.\n`);
}

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   CreditMesh Orchestrator — Hourly Loop       ║");
  console.log("║   Arc + USDC + Circle Nanopayments            ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  if (!fs.existsSync(AGENTS_FILE)) {
    console.error("❌ agents.json not found — run npm run agents:create && agents:bootstrap first");
    process.exit(1);
  }

  const records: AgentRecord[] = JSON.parse(fs.readFileSync(AGENTS_FILE, "utf-8"));
  const eligible = records.filter((r) => r.kyaPassed);

  if (eligible.length === 0) {
    console.error("❌ No KYA-approved agents found — run npm run agents:bootstrap first");
    process.exit(1);
  }

  console.log(`Starting ${eligible.length} agents (${records.length - eligible.length} skipped — KYA not passed)\n`);

  const savedState = loadSavedState();

  states = eligible.map((r) => {
    const saved = savedState.get(r.id);
    return {
      record:        r,
      activeLoanId:  saved?.activeLoanId ?? null,
      cycleCount:    saved?.cycleCount ?? 0,
      lastCycleAt:   null,
      totalEarned:   "0",
      totalBorrowed: "0",
    };
  });

  if (savedState.size > 0) {
    const active = states.filter((s) => s.activeLoanId !== null);
    if (active.length > 0) {
      console.log(`📂 Restored state: ${active.length} agents have active loans (${active.map((s) => `${s.record.name}→#${s.activeLoanId}`).join(", ")})\n`);
    }
  }

  await runCycle(states);
  setInterval(() => runCycle(states), CYCLE_MS);
}

main().catch(console.error);
