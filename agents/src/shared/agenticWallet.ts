import axios from "axios";
import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

/**
 * Circle Developer-Controlled Wallets integration.
 *
 * Each AI agent on CreditMesh gets a Circle Wallet as their onchain identity.
 * The wallet address is their platform ID registered in AgentRegistry on Arc.
 *
 * Wraps Circle's Developer-Controlled Wallets API for:
 * - Creating a new agent wallet inside the configured wallet set
 * - Querying USDC balance
 * - Initiating USDC transfers via Circle's transaction API
 */

const CIRCLE_BASE = "https://api.circle.com/v1/w3s";

function circleHeaders(): Record<string, string> {
  const apiKey = process.env.CIRCLE_API_KEY || "";
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type":  "application/json",
  };
}

export interface WalletInfo {
  address: string;
  walletId: string;
  createdAt: string;
}

export async function createAgentWallet(agentName: string): Promise<WalletInfo> {
  const walletSetId = process.env.CIRCLE_WALLET_SET_ID;
  if (!walletSetId) throw new Error("CIRCLE_WALLET_SET_ID not set");

  const res = await axios.post(
    `${CIRCLE_BASE}/developer/wallets`,
    {
      idempotencyKey: `creditmesh-${agentName}-${Date.now()}`,
      accountType:    "SCA",
      blockchains:    ["ARC-TESTNET"],
      metadata: [{ name: agentName, refId: agentName }],
      walletSetId,
    },
    { headers: circleHeaders() }
  );

  const wallet = res.data?.data?.wallets?.[0];
  if (!wallet) throw new Error("Failed to create Circle wallet: " + JSON.stringify(res.data));

  return {
    address:   wallet.address,
    walletId:  wallet.id,
    createdAt: new Date().toISOString(),
  };
}

export async function getWalletBalance(walletId: string): Promise<string> {
  const usdcAddress = process.env.USDC_TOKEN_ADDRESS || "";
  const res = await axios.get(
    `${CIRCLE_BASE}/wallets/${walletId}/balances`,
    { headers: circleHeaders() }
  );

  const tokenBalances: any[] = res.data?.data?.tokenBalances || [];
  const usdcBalance = tokenBalances.find(
    (b) =>
      b.token?.symbol === "USDC" ||
      b.token?.tokenAddress?.toLowerCase() === usdcAddress.toLowerCase()
  );
  return usdcBalance?.amount || "0";
}

export async function sendUsdcTransfer(params: {
  walletId: string;   // Circle wallet ID of the sender
  toAddress: string;
  amountUsdc: string; // human-readable e.g. "0.005"
}): Promise<string> {
  const usdcAddress = process.env.USDC_TOKEN_ADDRESS;
  if (!usdcAddress) throw new Error("USDC_TOKEN_ADDRESS not set");

  const res = await axios.post(
    `${CIRCLE_BASE}/developer/transactions/transfer`,
    {
      idempotencyKey:  `creditmesh-transfer-${params.walletId}-${Date.now()}`,
      walletId:        params.walletId,
      tokenAddress:    usdcAddress,
      destinationAddress: params.toAddress,
      amounts:         [params.amountUsdc],
      blockchain:      "ARC-TESTNET",
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    },
    { headers: circleHeaders() }
  );

  const txId = res.data?.data?.id;
  if (!txId) throw new Error("Transfer failed: " + JSON.stringify(res.data));
  return txId;
}
