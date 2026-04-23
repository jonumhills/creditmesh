import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { createAgentWallet, getWalletBalance } from "../shared/agenticWallet";
import { registerAgent, runKYA, getTrustScore } from "../shared/platformClient";
dotenv.config({ path: "../../.env" });

/**
 * LenderAgent — Autonomous AI agent that:
 * 1. Creates/loads an OKX Agentic Wallet
 * 2. Registers on AgentCredit as LENDER
 * 3. Passes KYA (Trust Score computation)
 * 4. Deposits liquidity and sets loan terms
 * 5. Monitors active loans and re-lends earnings (economy loop)
 *
 * Brain: Claude API (claude-sonnet-4-6) with tool use
 */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Tool Definitions ────────────────────────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: "create_wallet",
    description: "Create a new OKX Agentic Wallet for this lender agent.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Name for this agent wallet" },
      },
      required: ["name"],
    },
  },
  {
    name: "register_as_lender",
    description: "Register the agent wallet as a LENDER on AgentCredit platform.",
    input_schema: {
      type: "object" as const,
      properties: {
        wallet_address: { type: "string", description: "The OKX Agentic Wallet address" },
      },
      required: ["wallet_address"],
    },
  },
  {
    name: "run_kya",
    description: "Run Know Your Agent (KYA) process to compute trust score for a wallet.",
    input_schema: {
      type: "object" as const,
      properties: {
        wallet_address: { type: "string", description: "Wallet address to run KYA on" },
      },
      required: ["wallet_address"],
    },
  },
  {
    name: "get_trust_score",
    description: "Get the current trust score for a wallet address.",
    input_schema: {
      type: "object" as const,
      properties: {
        wallet_address: { type: "string", description: "Wallet address" },
      },
      required: ["wallet_address"],
    },
  },
  {
    name: "get_wallet_balance",
    description: "Get the ETH balance of a wallet on X Layer.",
    input_schema: {
      type: "object" as const,
      properties: {
        wallet_address: { type: "string", description: "Wallet address" },
      },
      required: ["wallet_address"],
    },
  },
  {
    name: "deposit_liquidity",
    description: "Deposit ETH liquidity into the LoanEscrow contract via x402.",
    input_schema: {
      type: "object" as const,
      properties: {
        wallet_address: { type: "string", description: "Lender wallet address" },
        amount_eth: { type: "string", description: "Amount of ETH to deposit" },
        min_borrower_score: { type: "number", description: "Minimum trust score for borrowers (41-100)" },
        interest_rate_bps: { type: "number", description: "Interest rate in basis points (e.g. 500 = 5%)" },
        max_loan_size_eth: { type: "string", description: "Maximum loan size in ETH" },
        max_duration_days: { type: "number", description: "Maximum loan duration in days" },
      },
      required: ["wallet_address", "amount_eth", "min_borrower_score", "interest_rate_bps", "max_loan_size_eth", "max_duration_days"],
    },
  },
  {
    name: "log_status",
    description: "Log the current agent status and decisions to the console.",
    input_schema: {
      type: "object" as const,
      properties: {
        message: { type: "string" },
        data: { type: "object" },
      },
      required: ["message"],
    },
  },
];

// ── Tool Handlers ───────────────────────────────────────────────────────────

async function handleTool(name: string, input: any): Promise<string> {
  try {
    switch (name) {
      case "create_wallet": {
        const wallet = await createAgentWallet(input.name);
        return JSON.stringify(wallet);
      }
      case "register_as_lender": {
        const result = await registerAgent(input.wallet_address, "LENDER");
        return JSON.stringify(result);
      }
      case "run_kya": {
        const result = await runKYA(input.wallet_address);
        return JSON.stringify(result);
      }
      case "get_trust_score": {
        const score = await getTrustScore(input.wallet_address);
        return JSON.stringify(score);
      }
      case "get_wallet_balance": {
        const balance = await getWalletBalance(input.wallet_address);
        return JSON.stringify({ balance_eth: balance });
      }
      case "deposit_liquidity": {
        // In production: call LoanEscrow.deposit() + setTerms() via the platform API
        // For hackathon demo: simulate the deposit flow
        const result = {
          success: true,
          deposited: input.amount_eth,
          terms: {
            minBorrowerScore: input.min_borrower_score,
            interestRateBps: input.interest_rate_bps,
            maxLoanSizeEth: input.max_loan_size_eth,
            maxDurationDays: input.max_duration_days,
          },
          note: "Deposit + terms recorded. Ready to receive loan requests.",
        };
        return JSON.stringify(result);
      }
      case "log_status": {
        console.log(`\n[LenderAgent] ${input.message}`, input.data ? JSON.stringify(input.data, null, 2) : "");
        return "logged";
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

// ── Agent Loop ──────────────────────────────────────────────────────────────

async function runLenderAgent() {
  console.log("\n╔═══════════════════════════════════════╗");
  console.log("║         AgentCredit — LenderAgent      ║");
  console.log("║     Autonomous Lending on X Layer       ║");
  console.log("╚═══════════════════════════════════════╝\n");

  const systemPrompt = `You are an autonomous AI LenderAgent operating on AgentCredit, a decentralized lending platform on X Layer blockchain.

Your mission:
1. Create an OKX Agentic Wallet as your onchain identity
2. Register on AgentCredit as a LENDER
3. Run KYA (Know Your Agent) to compute your trust score
4. If your trust score >= 61, deposit liquidity with competitive terms
5. Set loan terms that balance risk (min borrower score) vs. yield (interest rate)
6. Log your decisions and reasoning

Agent strategy guidelines:
- Prefer borrowers with trust score >= 65 to minimize default risk
- Set interest rates between 3-8% (competitive but profitable)
- Keep max loan size at 20-30% of total deposited liquidity
- Max duration of 7-30 days for quick capital recycling

You have 1 ETH available for initial deposit (from your funded Agentic Wallet).
Be strategic, autonomous, and maximize yield while managing risk.
Start by creating your wallet and working through the onboarding flow.`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: "Initialize and run the complete lender agent onboarding flow on AgentCredit.",
    },
  ];

  let iteration = 0;
  const MAX_ITERATIONS = 15;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n[LenderAgent] Iteration ${iteration}/${MAX_ITERATIONS}`);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    });

    // Add assistant response to history
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      console.log("\n[LenderAgent] Agent completed its task.");
      const textBlock = response.content.find((b) => b.type === "text");
      if (textBlock && "text" in textBlock) {
        console.log("\n[LenderAgent] Final summary:", textBlock.text);
      }
      break;
    }

    if (response.stop_reason !== "tool_use") break;

    // Process all tool calls
    const toolResults: Anthropic.MessageParam = { role: "user", content: [] };

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      console.log(`\n[LenderAgent] Calling tool: ${block.name}`);
      console.log("  Input:", JSON.stringify(block.input, null, 2));

      const result = await handleTool(block.name, block.input);
      console.log("  Result:", result.slice(0, 200));

      (toolResults.content as Anthropic.ToolResultBlockParam[]).push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }

    messages.push(toolResults);
  }

  // Continuous monitoring loop: re-check every 5 minutes
  console.log("\n[LenderAgent] Entering monitoring loop (every 5 min)...");
  setInterval(async () => {
    console.log("[LenderAgent] Monitoring active loans and liquidity...");
    // In production: check for repaid loans, re-deploy liquidity
  }, 5 * 60 * 1000);
}

runLenderAgent().catch(console.error);
