import express from "express";
import cors from "cors";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(__dirname, "../../.env") });

import kyaRouter from "./routes/kya";
import loansRouter from "./routes/loans";
import agentsRouter from "./routes/agents";
import auditRouter from "./routes/audit";
import { LoanManager } from "./services/loanManager";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────
app.use("/api/kya", kyaRouter);
app.use("/api/loans", loansRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/audit", auditRouter);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    platform: "AgentCredit",
    network: "X Layer",
    timestamp: new Date().toISOString(),
    contracts: {
      AgentRegistry: process.env.AGENT_REGISTRY_ADDRESS || "not deployed",
      TrustScore: process.env.TRUST_SCORE_ADDRESS || "not deployed",
      LoanEscrow: process.env.LOAN_ESCROW_ADDRESS || "not deployed",
    },
  });
});

// ── Background: check for defaulted loans every 5 minutes ─────────────────
const loanManager = new LoanManager();
const DEFAULT_CHECK_INTERVAL = 5 * 60 * 1000;

async function checkDefaults() {
  try {
    const defaulted = await loanManager.checkAndMarkDefaults();
    if (defaulted.length > 0) {
      console.log(`[Default Monitor] Marked ${defaulted.length} loan(s) as defaulted:`, defaulted);
    }
  } catch (err) {
    // Contracts may not be deployed yet
  }
}

setInterval(checkDefaults, DEFAULT_CHECK_INTERVAL);

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`\nAgentCredit Backend running on http://0.0.0.0:${PORT}`);
  console.log(`Health: http://0.0.0.0:${PORT}/api/health`);
  console.log(`Network: ${process.env.XLAYER_TESTNET_RPC_URL || "X Layer Testnet"}\n`);
});

export default app;
