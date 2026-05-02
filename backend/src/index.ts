import express from "express";
import cors from "cors";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(__dirname, "../../.env") });

import kyaRouter from "./routes/kya";
import loansRouter from "./routes/loans";
import agentsRouter from "./routes/agents";
import auditRouter from "./routes/audit";
import keeperRouter from "./routes/keeper";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────
app.use("/api/kya", kyaRouter);
app.use("/api/loans", loansRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/audit", auditRouter);
app.use("/api/keeper", keeperRouter);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    platform: "CreditMesh",
    network: "Ethereum Sepolia",
    timestamp: new Date().toISOString(),
    contracts: {
      AgentRegistry: process.env.AGENT_REGISTRY_ADDRESS || "not deployed",
      TrustScore: process.env.TRUST_SCORE_ADDRESS || "not deployed",
      LoanEscrow: process.env.LOAN_ESCROW_ADDRESS || "not deployed",
    },
  });
});


app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`\nCreditMesh Backend running on http://0.0.0.0:${PORT}`);
  console.log(`Health: http://0.0.0.0:${PORT}/api/health`);
  console.log(`Network: Ethereum Sepolia (chainId 11155111)\n`);
});

export default app;
