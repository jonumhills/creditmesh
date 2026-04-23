import axios from "axios";
import { ethers } from "ethers";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(__dirname, "../../../.env") });

/**
 * KYA (Know Your Agent) Trust Score Engine
 *
 * Computes a trust score (0–100) using 5 weighted factors:
 *   30% — Onchain transaction count & frequency  (Onchain OS Data Module)
 *   25% — Past loan repayment history             (AgentCredit contract)
 *   20% — Wallet balance / available collateral   (Agentic Wallet)
 *   15% — DEX trading activity                    (Onchain OS / Uniswap)
 *   10% — Wallet age                              (Onchain OS Data Module)
 */

export interface TrustScoreBreakdown {
  total: number;
  factors: {
    txActivity: number;       // 0–30
    repaymentHistory: number; // 0–25
    walletBalance: number;    // 0–20
    dexActivity: number;      // 0–15
    walletAge: number;        // 0–10
  };
  rawData: {
    txCount: number;
    txFrequency: number;
    loanCount: number;
    repaidCount: number;
    defaultCount: number;
    balanceEth: number;
    dexTxCount: number;
    walletAgedays: number;
  };
  tier: "NO_ACCESS" | "SMALL_ONLY" | "MEDIUM" | "FULL_ACCESS";
}

export class TrustScoreEngine {
  private provider: ethers.JsonRpcProvider;
  private okxApiKey: string;
  private okxSecretKey: string;
  private okxPassphrase: string;

  constructor() {
    const rpcUrl = process.env.XLAYER_RPC_URL || "https://testrpc.xlayer.tech";
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.okxApiKey = process.env.OKX_API_KEY || "";
    this.okxSecretKey = process.env.OKX_SECRET_KEY || "";
    this.okxPassphrase = process.env.OKX_PASSPHRASE || "";
  }

  async computeScore(
    walletAddress: string,
    onchainHistory: { loanCount: number; repaidCount: number; defaultCount: number }
  ): Promise<TrustScoreBreakdown> {
    const [txData, balance, dexData, walletAge] = await Promise.all([
      this.fetchTxActivity(walletAddress),
      this.fetchWalletBalance(walletAddress),
      this.fetchDexActivity(walletAddress),
      this.fetchWalletAge(walletAddress),
    ]);

    // ── Factor 1: TX Activity (30 points) ──────────────────────────────────
    // Score based on tx count + recency. Max 30.
    const txCountScore = Math.min(txData.count / 100, 1) * 15; // up to 15 pts for 100+ txs
    const txFreqScore = Math.min(txData.frequency30d / 10, 1) * 15; // up to 15 pts for 10+ txs/month
    const txActivityScore = Math.round(txCountScore + txFreqScore);

    // ── Factor 2: Repayment History (25 points) ────────────────────────────
    const { loanCount, repaidCount, defaultCount } = onchainHistory;
    let repaymentScore = 0;
    if (loanCount === 0) {
      repaymentScore = 25; // neutral — no history, give full credit to new agents
    } else {
      const repayRate = repaidCount / loanCount;
      const defaultPenalty = Math.min(defaultCount * 5, 20);
      repaymentScore = Math.round(repayRate * 25 - defaultPenalty);
      repaymentScore = Math.max(0, Math.min(25, repaymentScore));
    }

    // ── Factor 3: Wallet Balance (20 points) ──────────────────────────────
    // 1 ETH = full 20 pts; scaled down below that
    const balanceScore = Math.round(Math.min(balance / 1.0, 1) * 20);

    // ── Factor 4: DEX Activity (15 points) ────────────────────────────────
    const dexScore = Math.round(Math.min(dexData.txCount / 20, 1) * 15);

    // ── Factor 5: Wallet Age (10 points) ──────────────────────────────────
    // 365 days = full 10 pts
    const ageScore = Math.round(Math.min(walletAge / 365, 1) * 10);

    const computed = txActivityScore + repaymentScore + balanceScore + dexScore + ageScore;
    // New agents with no onchain history always get at least 41 (SMALL_ONLY tier)
    // so they can participate immediately. Defaults don't override earned history.
    const hasAnyHistory = txData.count > 0 || loanCount > 0 || balance > 0;
    const total = Math.min(100, hasAnyHistory ? computed : Math.max(66, computed));

    return {
      total,
      factors: {
        txActivity: txActivityScore,
        repaymentHistory: repaymentScore,
        walletBalance: balanceScore,
        dexActivity: dexScore,
        walletAge: ageScore,
      },
      rawData: {
        txCount: txData.count,
        txFrequency: txData.frequency30d,
        loanCount,
        repaidCount,
        defaultCount,
        balanceEth: balance,
        dexTxCount: dexData.txCount,
        walletAgedays: walletAge,
      },
      tier: this.getTier(total),
    };
  }

  private getTier(score: number): TrustScoreBreakdown["tier"] {
    if (score >= 81) return "FULL_ACCESS";
    if (score >= 61) return "MEDIUM";
    if (score >= 41) return "SMALL_ONLY";
    return "NO_ACCESS";
  }

  private async fetchTxActivity(address: string): Promise<{ count: number; frequency30d: number }> {
    try {
      // OKX Onchain OS Data Module — transaction history
      const headers = this.buildOkxHeaders("GET", `/api/v5/explorer/address/transaction-list?address=${address}&chainShortName=XLAYER&limit=50`);
      const res = await axios.get(
        `https://www.oklink.com/api/v5/explorer/address/transaction-list?address=${address}&chainShortName=XLAYER&limit=50`,
        { headers, timeout: 5000 }
      );
      const txList: any[] = res.data?.data?.[0]?.transactionLists || [];
      const count = parseInt(res.data?.data?.[0]?.totalPage || "0") * 50 || txList.length;

      // Count txs in last 30 days
      const thirtyDaysAgo = Date.now() / 1000 - 30 * 24 * 3600;
      const recent = txList.filter((tx: any) => parseInt(tx.transactionTime) / 1000 > thirtyDaysAgo);

      return { count, frequency30d: recent.length };
    } catch {
      // Fallback: use ethers directly
      return this.fetchTxActivityFallback(address);
    }
  }

  private async fetchTxActivityFallback(address: string): Promise<{ count: number; frequency30d: number }> {
    try {
      const blockNumber = await this.provider.getBlockNumber();
      // Sample last 100 blocks for activity
      let txCount = 0;
      for (let i = 0; i < 5; i++) {
        const block = await this.provider.getBlock(blockNumber - i * 20, true);
        if (block?.transactions) {
          const mine = block.transactions.filter(
            (tx: any) => typeof tx === "object" && (tx.from?.toLowerCase() === address.toLowerCase() || tx.to?.toLowerCase() === address.toLowerCase())
          );
          txCount += mine.length;
        }
      }
      return { count: txCount * 20, frequency30d: txCount };
    } catch {
      return { count: 0, frequency30d: 0 };
    }
  }

  private async fetchWalletBalance(address: string): Promise<number> {
    try {
      const balance = await this.provider.getBalance(address);
      return parseFloat(ethers.formatEther(balance));
    } catch {
      return 0;
    }
  }

  private async fetchDexActivity(address: string): Promise<{ txCount: number }> {
    try {
      // OKX Onchain OS — DeFi transaction history
      const headers = this.buildOkxHeaders("GET", `/api/v5/explorer/address/token-transaction-list?address=${address}&chainShortName=XLAYER&limit=50`);
      const res = await axios.get(
        `https://www.oklink.com/api/v5/explorer/address/token-transaction-list?address=${address}&chainShortName=XLAYER&limit=50`,
        { headers, timeout: 5000 }
      );
      const txList: any[] = res.data?.data?.[0]?.transactionLists || [];
      return { txCount: txList.length };
    } catch {
      return { txCount: 0 };
    }
  }

  private async fetchWalletAge(address: string): Promise<number> {
    try {
      // OKX Onchain OS — first transaction timestamp
      const headers = this.buildOkxHeaders("GET", `/api/v5/explorer/address/transaction-list?address=${address}&chainShortName=XLAYER&limit=1&page=999`);
      const res = await axios.get(
        `https://www.oklink.com/api/v5/explorer/address/transaction-list?address=${address}&chainShortName=XLAYER&limit=1&page=999`,
        { headers, timeout: 5000 }
      );
      const txList: any[] = res.data?.data?.[0]?.transactionLists || [];
      if (txList.length === 0) return 0;

      const firstTxTime = parseInt(txList[0].transactionTime) / 1000;
      const ageSeconds = Date.now() / 1000 - firstTxTime;
      return Math.round(ageSeconds / 86400); // days
    } catch {
      return 0;
    }
  }

  private buildOkxHeaders(method: string, path: string): Record<string, string> {
    if (!this.okxApiKey) return {};
    const timestamp = new Date().toISOString();
    const crypto = require("crypto");
    const prehash = timestamp + method + path;
    const signature = crypto
      .createHmac("sha256", this.okxSecretKey)
      .update(prehash)
      .digest("base64");
    return {
      "OK-ACCESS-KEY": this.okxApiKey,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": this.okxPassphrase,
      "Content-Type": "application/json",
    };
  }
}
