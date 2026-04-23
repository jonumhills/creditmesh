/**
 * createAgents.ts
 *
 * Creates Circle Developer-Controlled Wallets for all 11 agents (4 lenders + 7 borrowers).
 * Falls back to local ethers wallets if Circle API is unavailable.
 *
 * Output: agents/agents.json  (gitignored — contains wallet IDs and private keys)
 *
 * Run: npx ts-node-dev --transpile-only src/scripts/createAgents.ts
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import * as dotenv from "dotenv";
dotenv.config({ path: require("path").join(__dirname, "../../../.env") });

import { ALL_AGENT_CONFIGS } from "../config/agents.config";

const AGENTS_FILE = path.join(__dirname, "../../agents.json");
const CIRCLE_BASE = "https://api.circle.com/v1/w3s";

export interface AgentWallet {
  address: string;
  privateKey: string;
  circleWalletId?: string;  // set if created via Circle Developer-Controlled Wallets
  source: "circle" | "local";
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

// ── Circle Developer-Controlled Wallet creation ───────────────────────────────

async function createCircleWallet(name: string): Promise<AgentWallet> {
  const apiKey     = process.env.CIRCLE_API_KEY || "";
  const walletSetId = process.env.CIRCLE_WALLET_SET_ID;
  if (!walletSetId) throw new Error("CIRCLE_WALLET_SET_ID not set");

  const res = await axios.post(
    `${CIRCLE_BASE}/developer/wallets`,
    {
      idempotencyKey: `creditmesh-${name}-${Date.now()}`,
      accountType:    "SCA",
      blockchains:    ["ARC-TESTNET"],
      metadata:       [{ name, refId: name }],
      walletSetId,
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 15000,
    }
  );

  if (res.data?.data?.wallets?.[0] === undefined) {
    throw new Error(`Circle wallet creation failed: ${JSON.stringify(res.data)}`);
  }

  const wallet = res.data.data.wallets[0];
  return {
    address:         wallet.address,
    privateKey:      "",          // Circle manages keys server-side
    circleWalletId:  wallet.id,
    source:          "circle",
  };
}

async function createLocalWallet(): Promise<AgentWallet> {
  const w = ethers.Wallet.createRandom();
  return {
    address:    w.address,
    privateKey: w.privateKey,
    source:     "local",
  };
}

async function createWallet(name: string): Promise<AgentWallet> {
  const hasCircleKeys = process.env.CIRCLE_API_KEY && process.env.CIRCLE_WALLET_SET_ID;

  if (hasCircleKeys) {
    try {
      console.log(`  → Creating Circle wallet for ${name}...`);
      const wallet = await createCircleWallet(name);
      console.log(`  ✓ Circle wallet: ${wallet.address}`);
      return wallet;
    } catch (err: any) {
      console.log(`  ⚠ Circle API failed (${err.message}) — using local wallet`);
    }
  }

  const wallet = await createLocalWallet();
  console.log(`  ✓ Local EVM wallet: ${wallet.address}`);
  return wallet;
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
