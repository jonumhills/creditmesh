import { ethers } from "ethers";
import { getLoanEscrowContract, getTrustScoreContract, getProvider } from "../utils/blockchain";

export interface LoanMatch {
  lender: string;
  borrower: string;
  principal: bigint;
  interestBps: bigint;
  durationSeconds: bigint;
  lenderMinScore: number;
  borrowerScore: number;
}

export interface LoanRequest {
  borrower: string;
  amountWei: bigint;
  durationSeconds: bigint;
  purpose: string;
}

/**
 * Matchmaking Service
 *
 * Finds the best lender for a borrower's loan request based on:
 * 1. Lender has sufficient liquidity
 * 2. Borrower's trust score meets lender's minimum
 * 3. Requested amount <= lender's max loan size
 * 4. Duration <= lender's max duration
 *
 * Returns the best match (lowest interest rate that accepts the borrower).
 */
export class MatchmakingService {
  async findMatch(request: LoanRequest): Promise<LoanMatch | null> {
    const escrow = getLoanEscrowContract(getProvider());
    const trustScore = getTrustScoreContract(getProvider());

    // Get borrower's current trust score
    const borrowerScore: number = Number(await trustScore.getScore(request.borrower));

    // Get all active lenders
    const activeLenders: string[] = await escrow.getActiveLenders();
    if (activeLenders.length === 0) return null;

    const candidates: LoanMatch[] = [];

    for (const lender of activeLenders) {
      try {
        const terms = await escrow.lenderTerms(lender);
        if (!terms.active) continue;
        if (terms.availableLiquidity < request.amountWei) continue;
        if (request.amountWei > terms.maxLoanSize) continue;
        if (borrowerScore < terms.minBorrowerScore) continue;
        if (request.durationSeconds > terms.maxDurationSeconds) continue;

        candidates.push({
          lender,
          borrower: request.borrower,
          principal: request.amountWei,
          interestBps: terms.interestRateBps,
          durationSeconds: request.durationSeconds,
          lenderMinScore: terms.minBorrowerScore,
          borrowerScore,
        });
      } catch {
        continue;
      }
    }

    if (candidates.length === 0) return null;

    // Pick the lender with the lowest interest rate
    candidates.sort((a, b) => Number(a.interestBps) - Number(b.interestBps));
    return candidates[0];
  }

  async getAllLenderTerms() {
    const escrow = getLoanEscrowContract(getProvider());
    const activeLenders: string[] = await escrow.getActiveLenders();

    return Promise.all(
      activeLenders.map(async (lender) => {
        const terms = await escrow.lenderTerms(lender);
        return {
          lender,
          availableLiquidity: ethers.formatUnits(terms.availableLiquidity, 6),
          maxLoanSize: ethers.formatUnits(terms.maxLoanSize, 6),
          minBorrowerScore: Number(terms.minBorrowerScore),
          interestRateBps: Number(terms.interestRateBps),
          interestRatePct: Number(terms.interestRateBps) / 100,
          maxDurationDays: Math.round(Number(terms.maxDurationSeconds) / 86400),
          active: terms.active,
        };
      })
    );
  }
}
