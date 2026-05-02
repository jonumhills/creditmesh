/**
 * ogStorage.ts
 *
 * Wraps 0G Storage KV store for persisting agent state.
 * Replaces the local orchestrator-state.json file.
 *
 * KV structure:
 *   streamId: creditmesh-agent-state (fixed)
 *   key:      agent ID (e.g. "borrower-defi-trader")
 *   value:    JSON { activeLoanId, cycleCount }
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const OG_RPC_URL      = process.env.OG_RPC_URL      || "https://evmrpc-testnet.0g.ai";
const OG_KV_NODE_URL  = process.env.OG_KV_NODE_URL  || "http://3.101.147.150:6789";
const STREAM_ID       = process.env.OG_STREAM_ID    || "creditmesh-agent-state-v1";
const PRIVATE_KEY     = process.env.DEPLOYER_PRIVATE_KEY!;

interface AgentSnapshot {
  id:          string;
  activeLoanId: number | null;
  cycleCount:  number;
}

function toBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function fromBytes(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// ── Save all agent state to 0G Storage KV ─────────────────────────────────────

export async function saveAgentState(snapshots: AgentSnapshot[]): Promise<void> {
  try {
    // Dynamic import — 0G SDK uses ESM
    const { KvClient } = await import("@0glabs/0g-ts-sdk");
    const kvClient = new KvClient(OG_KV_NODE_URL);

    for (const snap of snapshots) {
      const keyBytes   = toBytes(snap.id);
      const valueBytes = toBytes(JSON.stringify({
        activeLoanId: snap.activeLoanId,
        cycleCount:   snap.cycleCount,
        savedAt:      new Date().toISOString(),
      }));

      // KvClient.set(streamId, key, value, version?)
      await kvClient.set(STREAM_ID, keyBytes, valueBytes);
    }

    console.log(`  [0G Storage] Saved state for ${snapshots.length} agents`);
  } catch (err: any) {
    // Fallback gracefully — don't crash the orchestrator if storage fails
    console.warn(`  [0G Storage] Save failed (non-fatal): ${err.message?.slice(0, 80)}`);
  }
}

// ── Load all agent state from 0G Storage KV ───────────────────────────────────

export async function loadAgentState(agentIds: string[]): Promise<Map<string, { activeLoanId: number | null; cycleCount: number }>> {
  const result = new Map<string, { activeLoanId: number | null; cycleCount: number }>();

  try {
    const { KvClient } = await import("@0glabs/0g-ts-sdk");
    const kvClient = new KvClient(OG_KV_NODE_URL);

    for (const id of agentIds) {
      const keyBytes = toBytes(id);
      const raw = await kvClient.getValue(STREAM_ID, Buffer.from(keyBytes).toString("base64"));

      if (raw) {
        const parsed = JSON.parse(fromBytes(new Uint8Array(Buffer.from(raw, "base64"))));
        result.set(id, {
          activeLoanId: parsed.activeLoanId ?? null,
          cycleCount:   parsed.cycleCount   ?? 0,
        });
      }
    }

    if (result.size > 0) {
      console.log(`  [0G Storage] Loaded state for ${result.size} agents`);
    }
  } catch (err: any) {
    console.warn(`  [0G Storage] Load failed (non-fatal): ${err.message?.slice(0, 80)}`);
  }

  return result;
}

// ── Log a loan event to 0G Storage Log (immutable audit trail) ────────────────

export async function logLoanEvent(event: {
  type:    "LOAN_CREATED" | "LOAN_REPAID" | "LOAN_DEFAULTED";
  loanId:  number;
  agent:   string;
  amount:  string;
  ts:      string;
}): Promise<void> {
  // Log entries are append-only — perfect for audit trail
  // Stored as JSON lines in a fixed stream
  try {
    const { KvClient } = await import("@0glabs/0g-ts-sdk");
    const kvClient = new KvClient(OG_KV_NODE_URL);

    const logKey   = toBytes(`loan-event-${event.loanId}-${Date.now()}`);
    const logValue = toBytes(JSON.stringify(event));
    await kvClient.set(STREAM_ID + "-log", logKey, logValue);
  } catch {
    // Non-fatal
  }
}
