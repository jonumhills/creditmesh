/**
 * Agent Definitions — 4 Lenders + 7 Borrowers
 *
 * Each definition describes the agent's personality, goals, and risk profile.
 * Amounts are in USDC (e.g. "0.005" = $0.005 — intentionally sub-cent for Nanopayments demo).
 * Wallets are generated separately and stored in agents.json (gitignored).
 */

export type AgentRole = "LENDER" | "BORROWER";

export interface LenderConfig {
  id: string;
  name: string;
  role: "LENDER";
  personality: string;
  goals: {
    depositAmountUsdc: string;    // how much USDC to lock into LoanEscrow
    minBorrowerScore:  number;    // minimum trust score to accept
    interestRateBps:   number;    // APR in basis points (500 = 5%)
    maxLoanSizeUsdc:   string;    // largest single loan
    maxDurationDays:   number;    // longest loan term
  };
}

export interface BorrowerConfig {
  id: string;
  name: string;
  role: "BORROWER";
  personality: string;
  goals: {
    loanAmountUsdc:        string;  // target borrow amount per cycle
    maxInterestRateBps:    number;  // won't borrow above this rate
    preferredDurationDays: number;  // preferred loan term
    purpose:               string;  // stated loan purpose (goes to LLM reasoning)
  };
}

export type AgentConfig = LenderConfig | BorrowerConfig;

// ─── 4 Lender Agents ────────────────────────────────────────────────────────

export const LENDER_CONFIGS: LenderConfig[] = [
  {
    id: "lender-conservative",
    name: "VaultKeeper",
    role: "LENDER",
    personality: "Risk-averse lender. Only lends to high-trust agents with proven repayment history. Prefers smaller, short-term loans.",
    goals: {
      depositAmountUsdc: "0.01",
      minBorrowerScore:  75,
      interestRateBps:   400,   // 4%
      maxLoanSizeUsdc:   "0.005",
      maxDurationDays:   3,
    },
  },
  {
    id: "lender-balanced",
    name: "SteadyYield",
    role: "LENDER",
    personality: "Balanced lender targeting consistent returns. Accepts medium-trust borrowers with moderate loan sizes.",
    goals: {
      depositAmountUsdc: "0.01",
      minBorrowerScore:  65,
      interestRateBps:   500,   // 5%
      maxLoanSizeUsdc:   "0.007",
      maxDurationDays:   7,
    },
  },
  {
    id: "lender-yield-seeker",
    name: "AlphaYield",
    role: "LENDER",
    personality: "Yield-maximising lender. Accepts lower-trust borrowers in exchange for higher interest rates.",
    goals: {
      depositAmountUsdc: "0.01",
      minBorrowerScore:  61,
      interestRateBps:   750,   // 7.5%
      maxLoanSizeUsdc:   "0.008",
      maxDurationDays:   7,
    },
  },
  {
    id: "lender-whale",
    name: "LiquidityPool",
    role: "LENDER",
    personality: "High-liquidity lender offering the largest loans on the platform. Only works with established, high-score borrowers.",
    goals: {
      depositAmountUsdc: "0.015",
      minBorrowerScore:  70,
      interestRateBps:   600,   // 6%
      maxLoanSizeUsdc:   "0.01",
      maxDurationDays:   14,
    },
  },
];

// ─── 7 Borrower Agents ───────────────────────────────────────────────────────

export const BORROWER_CONFIGS: BorrowerConfig[] = [
  {
    id: "borrower-alpha",
    name: "DeFiTrader",
    role: "BORROWER",
    personality: "Experienced DeFi trader with strong onchain history. Borrows to amplify yield farming positions. Always repays on time.",
    goals: {
      loanAmountUsdc:        "0.005",
      maxInterestRateBps:    700,
      preferredDurationDays: 1,
      purpose: "Yield farming — LP position on Arc DEX",
    },
  },
  {
    id: "borrower-beta",
    name: "ArbitrageBot",
    role: "BORROWER",
    personality: "Arbitrage agent that needs short-term liquidity to capture price discrepancies across DEXs.",
    goals: {
      loanAmountUsdc:        "0.004",
      maxInterestRateBps:    800,
      preferredDurationDays: 1,
      purpose: "DEX arbitrage between pools on Arc",
    },
  },
  {
    id: "borrower-gamma",
    name: "LiquidityMiner",
    role: "BORROWER",
    personality: "Liquidity mining agent. Borrows to provide liquidity and earn trading fees + incentives.",
    goals: {
      loanAmountUsdc:        "0.005",
      maxInterestRateBps:    600,
      preferredDurationDays: 3,
      purpose: "Liquidity provision on Arc — earn LP rewards",
    },
  },
  {
    id: "borrower-delta",
    name: "YieldOptimiser",
    role: "BORROWER",
    personality: "Methodical yield optimiser. Moves funds between protocols to capture the best risk-adjusted return.",
    goals: {
      loanAmountUsdc:        "0.004",
      maxInterestRateBps:    650,
      preferredDurationDays: 2,
      purpose: "Cross-protocol yield optimisation on Arc",
    },
  },
  {
    id: "borrower-epsilon",
    name: "NewAgent",
    role: "BORROWER",
    personality: "New to the platform — low initial score. Borrows small amounts to build credit history.",
    goals: {
      loanAmountUsdc:        "0.002",
      maxInterestRateBps:    900,
      preferredDurationDays: 1,
      purpose: "Building credit history on CreditMesh",
    },
  },
  {
    id: "borrower-zeta",
    name: "FlashBorrower",
    role: "BORROWER",
    personality: "High-frequency borrower. Takes many small short-term loans to maximise trust score growth.",
    goals: {
      loanAmountUsdc:        "0.003",
      maxInterestRateBps:    800,
      preferredDurationDays: 1,
      purpose: "Frequent short-term borrowing to build reputation",
    },
  },
  {
    id: "borrower-eta",
    name: "StrategyAgent",
    role: "BORROWER",
    personality: "Strategy-driven agent borrowing for medium-term protocol interactions.",
    goals: {
      loanAmountUsdc:        "0.004",
      maxInterestRateBps:    700,
      preferredDurationDays: 2,
      purpose: "On-chain strategy execution — staking + lending on Arc",
    },
  },
];

export const ALL_AGENT_CONFIGS: AgentConfig[] = [
  ...LENDER_CONFIGS,
  ...BORROWER_CONFIGS,
];
