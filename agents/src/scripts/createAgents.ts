/**
 * createAgents.ts
 *
 * Creates local EVM wallets for all 11 agents (4 lenders + 7 borrowers) on Ethereum Sepolia.
 *
 * Output: agents/agents.json  (gitignored — contains wallet IDs and private keys)
 *
 * Run: npx ts-node-dev --transpile-only src/scripts/createAgents.ts
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: require("path").join(__dirname, "../../../.env") });

import { ALL_AGENT_CONFIGS } from "../config/agents.config";

const AGENTS_FILE = path.join(__dirname, "../../agents.json");

export interface AgentWallet {
  address: string;
  privateKey: string;
  source: "local";
}

export interface AgentRecord {
  id: string;
  name: string;
  role: "LENDER" | "BORROWER";
  wallet: AgentWallet;
  registered: boolean;
  kyaPassed: boolean;
  trustScore: number;
  createdAt: string;
}

// ── Local EVM wallet creation ─────────────────────────────────────────────────

async function createWallet(name: string): Promise<AgentWallet> {
  const w = ethers.Wallet.createRandom();
  console.log(`  ✓ EVM wallet for ${name}: ${w.address}`);
  return {
    address:    w.address,
    privateKey: w.privateKey,
    source:     "local",
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║      CreditMesh — Create Agents       ║");
  console.log("╚══════════════════════════════════════╝\n");

  let existing: AgentRecord[] = [];
  if (fs.existsSync(AGENTS_FILE)) {
    existing = JSON.parse(fs.readFileSync(AGENTS_FILE, "utf-8"));
    console.log(`ℹ  Found ${existing.length} existing agents in agents.json\n`);
  }

  const existingIds = new Set(existing.map((a) => a.id));
  const records: AgentRecord[] = [...existing];

  for (const config of ALL_AGENT_CONFIGS) {
    if (existingIds.has(config.id)) {
      console.log(`⏭  Skipping ${config.name} (${config.id}) — already exists`);
      continue;
    }

    console.log(`\nCreating ${config.role}: ${config.name} (${config.id})`);
    const wallet = await createWallet(config.name);

    records.push({
      id:         config.id,
      name:       config.name,
      role:       config.role,
      wallet,
      registered: false,
      kyaPassed:  false,
      trustScore: 0,
      createdAt:  new Date().toISOString(),
    });

    await new Promise((r) => setTimeout(r, 500));
  }

  fs.writeFileSync(AGENTS_FILE, JSON.stringify(records, null, 2));
  console.log(`\n✅ ${records.length} agents saved to agents.json\n`);

  console.log("┌─────────────────────────┬──────────┬────────────────────────────────────────────┐");
  console.log("│ Name                    │ Role     │ Address                                    │");
  console.log("├─────────────────────────┼──────────┼────────────────────────────────────────────┤");
  for (const r of records) {
    const name = r.name.padEnd(23);
    const role = r.role.padEnd(8);
    console.log(`│ ${name} │ ${role} │ ${r.wallet.address} │`);
  }
  console.log("└─────────────────────────┴──────────┴────────────────────────────────────────────┘");
  console.log("\nNext: npm run agents:fund\n");
}

main().catch(console.error);
