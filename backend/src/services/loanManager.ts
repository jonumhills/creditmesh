import { getLoanEscrowContract, getSigner, formatUsdc } from "../utils/blockchain";
import { MatchmakingService, LoanRequest } from "./matchmaking";

export enum LoanStatus {
  PENDING = 0,
  ACTIVE = 1,
  REPAID = 2,
  DEFAULTED = 3,
  CANCELLED = 4,
}

export class LoanManager {
  private matchmaking = new MatchmakingService();

  async processLoanRequest(request: LoanRequest): Promise<{
    success: boolean;
    loanId?: number;
    match?: any;
    error?: string;
  }> {
    const match = await this.matchmaking.findMatch(request);
    if (!match) {
      return { success: false, error: "No matching lender found for the given criteria." };
    }

    try {
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

      const principalUsdc = formatUsdc(match.principal);
      return {
        success: true,
        loanId,
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

  async confirmRepayment(loanId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const escrowWithSigner = getLoanEscrowContract(getSigner());
      const tx = await escrowWithSigner.recordRepayment(loanId);
      await tx.wait();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async getAllLoans(): Promise<any[]> {
    const escrow = getLoanEscrowContract();
    const total = Number(await (escrow as any).nextLoanId?.() ?? 0);
    if (total === 0) return [];

    const results = await Promise.allSettled(
      Array.from({ length: total }, (_, i) => this.getLoanDetails(i))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
      .map(r => r.value)
      .sort((a: any, b: any) => b.id - a.id);
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
