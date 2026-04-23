import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";
import { createAgentWallet, getWalletBalance } from "../shared/agenticWallet";
import { registerAgent, runKYA, getTrustScore, requestLoan, getLoan, getActiveLenders } from "../shared/platformClient";
dotenv.config({ path: "../../.env" });

/**
 * BorrowerAgent — Autonomous AI agent that:
 * 1. Creates/loads an OKX Agentic Wallet
 * 2. Registers on AgentCredit as BORROWER
 * 3. Passes KYA — must score >= 41 to proceed
 * 4. Evaluates available lenders and requests a loan
 * 5. Simulates using the loan funds (e.g. DeFi operations)
 * 6. Repays the loan + interest via x402 before deadline
 *
 * Brain: Claude API (claude-sonnet-4-6) with tool use
 */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const tools: Anthropic.Tool[] = [
  {
    name: "create_wallet",
    description: "Create a new OKX Agentic Wallet for this borrower agent.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "register_as_borrower",
    description: "Register the agent wallet as a BORROWER on AgentCredit.",
    input_schema: {
      type: "object" as const,
      properties: {
        wallet_address: { type: "string" },
      },
      required: ["wallet_address"],
    },
  },
  {
    name: "run_kya",
    description: "Run KYA process to compute trust score. Must be >= 41 to borrow.",
    input_schema: {
      type: "object" as const,
      properties: {
        wallet_address: { type: "string" },
      },
      required: ["wallet_address"],
    },
  },
  {
    name: "get_trust_score",
    description: "Get current trust score for a wallet.",
    input_schema: {
      type: "object" as const,
      properties: {
        wallet_address: { type: "string" },
      },
      required: ["wallet_address"],
    },
  },
  {
    name: "get_active_lenders",
    description: "Get list of active lenders and their terms (interest rate, min score, max loan size).",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "request_loan",
    description: "Submit a loan request to the platform. Platform will match with best lender.",
    input_schema: {
      type: "object" as const,
      properties: {
        borrower_wallet: { type: "string", description: "Your wallet address" },
        amount_eth: { type: "string", description: "Amount of ETH to borrow" },
        duration_days: { type: "number", description: "Loan duration in days" },
        purpose: { type: "string", description: "What will you use the loan for?" },
      },
      required: ["borrower_wallet", "amount_eth", "duration_days", "purpose"],
    },
  },
  {
    name: "get_loan_details",
    description: "Get details of an active loan by ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        loan_id: { type: "number" },
      },
      required: ["loan_id"],
    },
  },
  {
    name: "repay_loan",
    description: "Repay a loan via x402 protocol. Sends principal + interest to lender.",
    input_schema: {
      type: "object" as const,
      properties: {
        loan_id: { type: "number" },
        borrower_wallet: { type: "string" },
      },
      required: ["loan_id", "borrower_wallet"],
    },
  },
  {
    name: "log_status",
    description: "Log agent status and decisions.",
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

async function handleTool(name: string, input: any): Promise<string> {
  try {
    switch (name) {
      case "create_wallet": {
        const wallet = await createAgentWallet(input.name);
        return JSON.stringify(wallet);
      }
      case "register_as_borrower": {
        const result = await registerAgent(input.wallet_address, "BORROWER");
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
      case "get_active_lenders": {
        const lenders = await getActiveLenders();
        return JSON.stringify(lenders);
      }
      case "request_loan": {
        const result = await requestLoan({
          borrower: input.borrower_wallet,
          amountEth: input.amount_eth,
          durationDays: input.duration_days,
          purpose: input.purpose,
        });
        return JSON.stringify(result);
      }
      case "get_loan_details": {
        const loan = await getLoan(input.loan_id);
        return JSON.stringify(loan);
      }
      case "repay_loan": {
        // In production: send ETH via x402 protocol to lender, then confirm onchain
        // For demo: confirm repayment directly
        const { default: axios } = await import("axios");
        const res = await axios.post(
          `${process.env.BACKEND_URL || "http://localhost:3001"}/api/loans/${input.loan_id}/repay`
        );
        return JSON.stringify(res.data);
      }
      case "log_status": {
        console.log(`\n[BorrowerAgent] ${input.message}`, input.data ? JSON.stringify(input.data, null, 2) : "");
        return "logged";
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

async function runBorrowerAgent() {
  console.log("\n╔═══════════════════════════════════════╗");
  console.log("║        AgentCredit — BorrowerAgent     ║");
  console.log("║     Autonomous Borrowing on X Layer     ║");
  console.log("╚═══════════════════════════════════════╝\n");

  const systemPrompt = `You are an autonomous AI BorrowerAgent operating on AgentCredit, a decentralized lending platform on X Layer.

Your mission:
1. Create an OKX Agentic Wallet as your onchain identity
2. Register on AgentCredit as a BORROWER
3. Run KYA — your trust score must be >= 41 to borrow
4. Review active lenders and pick the best terms (lowest interest + reasonable requirements)
5. Request a small loan (start with 0.05-0.1 ETH) for 7 days
6. Use the loan for a productive purpose (DeFi yield farming, liquidity provision, etc.)
7. Repay the loan before the deadline to build your trust score

Decision guidelines:
- Only borrow what you can repay (keep loan amount small initially)
- Choose the lender with the lowest interest rate
- Always repay on time to increase your trust score
- Explain your reasoning for each decision

If your trust score is below 41, you cannot borrow — report this clearly.
Be strategic and act like a responsible borrower building credit history.`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: "Initialize and run the complete borrower agent flow on AgentCredit. Get a loan and repay it.",
    },
  ];

  let iteration = 0;
  const MAX_ITERATIONS = 20;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`\n[BorrowerAgent] Iteration ${iteration}/${MAX_ITERATIONS}`);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      console.log("\n[BorrowerAgent] Agent completed its task.");
      const textBlock = response.content.find((b) => b.type === "text");
      if (textBlock && "text" in textBlock) {
        console.log("\n[BorrowerAgent] Final summary:", textBlock.text);
      }
      break;
    }

    if (response.stop_reason !== "tool_use") break;

    const toolResults: Anthropic.MessageParam = { role: "user", content: [] };

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      console.log(`\n[BorrowerAgent] Calling tool: ${block.name}`);
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
}

runBorrowerAgent().catch(console.error);
