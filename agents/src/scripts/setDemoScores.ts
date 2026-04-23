/**
 * setDemoScores.ts
 *
 * Directly sets trust scores for all demo agents via the deployer wallet.
 * Used because fresh testnet wallets have no onchain history → KYA scores too low.
 *
 * Run: npm run agents:setscores
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: require("path").join(__dirname, "../../../.env") });

const AGENTS_FILE = path.join(__dirname, "../../agents.json");
const TESTNET_RPC = process.env.XLAYER_TESTNET_RPC_URL || "https://testrpc.xlayer.tech";

const TRUST_SCORE_ABI = [
  "function setScore(address agent, uint8 newScore) external",
  "function markKYAPassed(address wallet) external",
];
const AGENT_REGISTRY_ABI = [
  "function markKYAPassed(address wallet) external",
];

// Demo scores — reflect each agent's intended reputation tier
const DEMO_SCORES: Record<string, number> = {
  "lender-conservative":  82,  // VaultKeeper     — high trust, conservative
  "lender-balanced":      78,  // SteadyYield     — solid track record
  "lender-yield-seeker":  71,  // AlphaYield      — medium-high
  "lender-whale":         85,  // LiquidityPool   — highest trust lender
  "borrower-alpha":       79,  // DeFiTrader      — experienced, always repays
  "borrower-beta":        68,  // ArbitrageBot    — good history
  "borrower-gamma":       65,  // LiquidityMiner  — medium trust
  "borrower-delta":       67,  // YieldOptimiser  — medium trust
  "borrower-epsilon":     43,  // NewAgent        — just above threshold (new)
  "borrower-zeta":        55,  // FlashBorrower   — building reputation
  "borrower-eta":         62,  // StrategyAgent   — medium trust
};

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║   BancoProtocol — Set Demo Scores     ║");
  console.log("╚══════════════════════════════════════╝\n");

  const agents = JSON.parse(fs.readFileSync(AGENTS_FILE, "utf-8"));
  const provider = new ethers.JsonRpcProvider(TESTNET_RPC);
  const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);

  const tsAddress  = process.env.TRUST_SCORE_ADDRESS!;
  const regAddress = process.env.AGENT_REGISTRY_ADDRESS!;

  const tsContract  = new ethers.Contract(tsAddress,  TRUST_SCORE_ABI,    deployer);
  const regContract = new ethers.Contract(regAddress, AGENT_REGISTRY_ABI, deployer);

  for (const agent of agents) {
    const score = DEMO_SCORES[agent.id];
    if (!score) { console.log(`⏭  ${agent.name} — no demo score defined`); continue; }

    console.log(`\n[${agent.name}] ${agent.wallet.address}`);
    console.log(`  → Setting score to ${score}...`);

    const tx1 = await tsContract.setScore(agent.wallet.address, score);
    await tx1.wait();
    console.log(`  ✓ Score set: ${score}`);

    console.log(`  → Marking KYA passed...`);
    try {
      const tx2 = await regContract.markKYAPassed(agent.wallet.address);
      await tx2.wait();
      console.log(`  ✓ KYA passed`);
    } catch { console.log(`  ⏭  KYA already marked`); }

    // Update agents.json
    agent.trustScore = score;
    agent.kyaPassed  = true;

    await new Promise((r) => setTimeout(r, 1000));
  }

  fs.writeFileSync(AGENTS_FILE, JSON.stringify(agents, null, 2));

  console.log("\n── Final Scores ────────────────────────────────────────────────");
  for (const a of agents) {
    console.log(`${a.name.padEnd(18)} ${a.role.padEnd(10)} score: ${a.trustScore}  KYA: ${a.kyaPassed ? "✓" : "✗"}`);
  }
  console.log("\nNext: npm run agents:bootstrap (for lender deposits), then npm run agents:start\n");
}

main().catch(console.error);
