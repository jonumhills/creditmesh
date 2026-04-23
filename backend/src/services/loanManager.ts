import { ethers } from "ethers";
import axios from "axios";
import { getLoanEscrowContract, getSigner, formatUsdc } from "../utils/blockchain";
import { MatchmakingService, LoanRequest } from "./matchmaking";

export enum LoanStatus {
  PENDING = 0,
  ACTIVE = 1,
  REPAID = 2,
  DEFAULTED = 3,
  CANCELLED = 4,
}

// ── Circle Nanopayments ───────────────────────────────────────────────────────

const NANOPAYMENTS_BASE = process.env.CIRCLE_NANOPAYMENTS_BASE_URL || "https://api.circle.com/nanopayments/v1";

function nanopayHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.CIRCLE_API_KEY || ""}`,
    "Content-Type": "application/json",
  };
}

/**
 * Disburse a loan from lender to borrower via Circle Nanopayments.
 * Returns the Nanopayment transaction ID.
 */
async function nanopayDisburse(params: {
  fromAddress: string;
  toAddress:   string;
  amountUsdc:  string;  // human-readable e.g. "0.005"
  loanId:      number;
}): Promise<string> {
  const res = await axios.post(
    `${NANOPAYMENTS_BASE}/transfers`,
    {
      idempotencyKey: `creditmesh-disburse-${params.loanId}-${Date.now()}`,
      source:      { address: params.fromAddress },
      destination: { address: params.toAddress },
      amount:      { currency: "USDC", amount: params.amountUsdc },
      metadata:    { loanId: String(params.loanId), type: "disbursement" },
    },
    { headers: nanopayHeaders() }
  );
  const txId = res.data?.data?.id || res.data?.id;
  if (!txId) throw new Error("Nanopayment disbursement failed: " + JSON.stringify(res.data));
  return txId;
}

/**
 * Collect repayment from borrower to lender via Circle Nanopayments.
 * Returns the Nanopayment transaction ID.
 */
async function nanopayRepay(params: {
  fromAddress: string;
  toAddress:   string;
  amountUsdc:  string;
  loanId:      number;
}): Promise<string> {
  const res = await axios.post(
    `${NANOPAYMENTS_BASE}/transfers`,
    {
      idempotencyKey: `creditmesh-repay-${params.loanId}-${Date.now()}`,
      source:      { address: params.fromAddress },
      destination: { address: params.toAddress },
      amount:      { currency: "USDC", amount: params.amountUsdc },
      metadata:    { loanId: String(params.loanId), type: "repayment" },
    },
    { headers: nanopayHeaders() }
  );
  const txId = res.data?.data?.id || res.data?.id;
  if (!txId) throw new Error("Nanopayment repayment failed: " + JSON.stringify(res.data));
  return txId;
}

// ── LoanManager ───────────────────────────────────────────────────────────────

export class LoanManager {
  private matchmaking = new MatchmakingService();

  /**
   * Process a loan request end-to-end:
   * 1. Find a matching lender via matchmaking
   * 2. Create the loan record onchain (Arc)
   * 3. Disburse principal lender → borrower via Circle Nanopayments
   */
  async processLoanRequest(request: LoanRequest): Promise<{
    success: boolean;
    loanId?: number;
    nanopayTxId?: string;
    match?: any;
    error?: string;
  }> {
    const match = await this.matchmaking.findMatch(request);
    if (!match) {
      return { success: false, error: "No matching lender found for the given criteria." };
    }

    try {
      // 1. Record loan state onchain
      const escrow = getLoanEscrowContract(getSigner());
      const tx = await escrow.createLoan(
        match.lender,
        match.borrower,
        match.principal,
        match.durationSeconds
      );
      const receipt = await tx.wait();

      let loanId = 0;
      if (receipt?.logs) {
        for (const log of receipt.logs) {
          try {
            const parsed = escrow.interface.parseLog(log);
            if (parsed?.name === "LoanCreated") {
              loanId = Number(parsed.args.loanId);
              break;
            }
          } catch { /* skip */ }
        }
      }

      // 2. Disburse via Circle Nanopayments (lender → borrower)
      const principalUsdc = formatUsdc(match.principal);
      let nanopayTxId: string | undefined;
      try {
        nanopayTxId = await nanopayDisburse({
          fromAddress: match.lender,
          toAddress:   match.borrower,
          amountUsdc:  principalUsdc,
          loanId,
        });
      } catch (npErr: any) {
        // Nanopayment failure is logged but doesn't roll back the onchain record
        console.error(`[loanManager] Nanopayment disbursement error: ${npErr.message}`);
      }

      return {
        success: true,
        loanId,
        nanopayTxId,
        match: {
          lender:          match.lender,
          borrower:        match.borrower,
          principal:       principalUsdc,
          interestBps:     Number(match.interestBps),
          interestPct:     Number(match.interestBps) / 100,
          durationSeconds: Number(match.durationSeconds),
          durationHours:   +(Number(match.durationSeconds) / 3600).toFixed(1),
          durationDays:    +(Number(match.durationSeconds) / 86400).toFixed(2),
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getLoanDetails(loanId: number) {
    const escrow   = getLoanEscrowContract();
    const loan     = await escrow.getLoan(loanId);
    const totalDue = await escrow.getTotalDue(loanId);

    return {
      id:          Number(loan.id),
      lender:      loan.lender,
      borrower:    loan.borrower,
      principal:   formatUsdc(loan.principal),
      interestBps: Number(loan.interestBps),
      interestPct: Number(loan.interestBps) / 100,
      startTime:   new Date(Number(loan.startTime) * 1000).toISOString(),
      dueTime:     new Date(Number(loan.dueTime) * 1000).toISOString(),
      totalDue:    formatUsdc(totalDue),
      status:      LoanStatus[Number(loan.status)],
    };
  }

  /**
   * Confirm repayment:
   * 1. Collect repayment from borrower → lender via Circle Nanopayments
   * 2. Record repayment state onchain
   */
  async confirmRepayment(loanId: number): Promise<{ success: boolean; nanopayTxId?: string; error?: string }> {
    try {
      const escrow = getLoanEscrowContract();
      const loan   = await escrow.getLoan(loanId);
      const due    = await escrow.getTotalDue(loanId);

      // 1. Collect via Nanopayments (borrower → lender)
      let nanopayTxId: string | undefined;
      try {
        nanopayTxId = await nanopayRepay({
          fromAddress: loan.borrower,
          toAddress:   loan.lender,
          amountUsdc:  formatUsdc(due),
          loanId,
        });
      } catch (npErr: any) {
        console.error(`[loanManager] Nanopayment repayment error: ${npErr.message}`);
      }

      // 2. Record onchain
      const escrowWithSigner = getLoanEscrowContract(getSigner());
      const tx = await escrowWithSigner.recordRepayment(loanId);
      await tx.wait();

      return { success: true, nanopayTxId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async checkAndMarkDefaults(): Promise<number[]> {
    const escrow = getLoanEscrowContract(getSigner());
    const now    = Math.floor(Date.now() / 1000);
    const nextId = Number(await escrow.nextLoanId?.() || 0);
    const defaulted: number[] = [];

    for (let i = 0; i < nextId; i++) {
      try {
        const loan = await escrow.getLoan(i);
        if (Number(loan.status) === LoanStatus.ACTIVE && Number(loan.dueTime) < now) {
          const tx = await escrow.markDefault(i);
          await tx.wait();
          defaulted.push(i);
        }
      } catch { /* skip */ }
    }

    return defaulted;
  }
}
