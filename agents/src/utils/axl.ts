/**
 * axl.ts
 *
 * Gensyn AXL peer-to-peer messaging layer for CreditMesh agents.
 * Agents communicate loan requests and offers directly over AXL mesh
 * instead of through the central API — fully decentralised coordination.
 *
 * AXL node exposes HTTP on localhost:9002 by default.
 * Each agent has a peerId derived from its wallet address.
 *
 * Install AXL: https://docs.gensyn.ai/tech/agent-exchange-layer
 * Run: ./axl --port 9002
 */

import axios from "axios";

const AXL_URL = process.env.AXL_NODE_URL || "http://localhost:9002";

export interface LoanRequest {
  type:        "LOAN_REQUEST";
  borrower:    string;
  amountUsdc:  string;
  durationHrs: number;
  trustScore:  number;
  purpose:     string;
}

export interface LoanOffer {
  type:           "LOAN_OFFER";
  lender:         string;
  amountUsdc:     string;
  interestRatePct: number;
  minScore:       number;
  accepted:       boolean;
}

export type AXLMessage = LoanRequest | LoanOffer;

// ── Check if AXL node is running ──────────────────────────────────────────────

export async function isAXLAvailable(): Promise<boolean> {
  try {
    await axios.get(`${AXL_URL}/health`, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

// ── Get this node's peer ID ───────────────────────────────────────────────────

export async function getLocalPeerId(): Promise<string | null> {
  try {
    const res = await axios.get(`${AXL_URL}/peer`, { timeout: 3000 });
    return res.data.peerId || null;
  } catch {
    return null;
  }
}

// ── Broadcast a loan request to all connected lender peers ───────────────────

export async function broadcastLoanRequest(request: LoanRequest): Promise<boolean> {
  try {
    await axios.post(`${AXL_URL}/broadcast`, {
      topic: "creditmesh.loan_request",
      data:  request,
    }, { timeout: 5000 });
    console.log(`  [AXL] Broadcast loan request: ${request.amountUsdc} USDC from ${request.borrower.slice(0, 8)}...`);
    return true;
  } catch (err: any) {
    console.warn(`  [AXL] Broadcast failed (falling back to API): ${err.message?.slice(0, 60)}`);
    return false;
  }
}

// ── Send a direct message to a specific peer ─────────────────────────────────

export async function sendToPeer(peerId: string, message: AXLMessage): Promise<boolean> {
  try {
    await axios.post(`${AXL_URL}/send`, {
      peerId,
      data: message,
    }, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// ── Poll for incoming messages (loan offers from lenders) ────────────────────

export async function pollMessages(topic: string): Promise<AXLMessage[]> {
  try {
    const res = await axios.get(`${AXL_URL}/messages`, {
      params:  { topic },
      timeout: 3000,
    });
    return res.data.messages || [];
  } catch {
    return [];
  }
}

// ── Subscribe to a topic ──────────────────────────────────────────────────────

export async function subscribe(topic: string): Promise<boolean> {
  try {
    await axios.post(`${AXL_URL}/subscribe`, { topic }, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}
