import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { LoanManager } from "../services/loanManager";
import { MatchmakingService } from "../services/matchmaking";

const router = Router();
const loanManager = new LoanManager();
const matchmaking = new MatchmakingService();

/**
 * GET /api/loans?limit=20&offset=0
 * Paginated loan list, newest first. Default: limit=20, offset=0.
 * NOTE: must be defined before /:loanId to avoid route shadowing.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  as string) || 20, 50);
    const offset = Math.max(parseInt(req.query.offset as string) || 0,  0);
    const result = await loanManager.getLoansPage(limit, offset);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/loans/lenders/active
 * Get all active lender terms.
 * NOTE: must be defined before /:loanId to avoid route shadowing.
 */
router.get("/lenders/active", async (_req: Request, res: Response) => {
  try {
    const lenders = await matchmaking.getAllLenderTerms();
    return res.json({ lenders });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/loans/request
 * Borrower agent submits a loan request.
 * Body: { borrower: string, amountEth: string, durationDays: number, purpose: string }
 */
router.post("/request", async (req: Request, res: Response) => {
  try {
    // Accept amountUsdc (new) or amountEth (legacy) — both are USDC amounts with 6 decimals on Sepolia
    const { borrower, amountUsdc, amountEth, durationDays, durationHours, purpose } = req.body;
    const amount = amountUsdc ?? amountEth;
    if (!borrower || !amount || (!durationDays && !durationHours)) {
      return res.status(400).json({ error: "borrower, amountUsdc, durationDays or durationHours required" });
    }

    const hours = Number(durationHours);
    const durationSeconds = durationHours
      ? BigInt(Math.max(3600, Math.round(hours * 3600)))
      : BigInt(Number(durationDays) * 86400);

    const result = await loanManager.processLoanRequest({
      borrower,
      amountWei: ethers.parseUnits(amount.toString(), 6),
      durationSeconds,
      purpose: purpose || "",
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.json({ success: true, loanId: result.loanId, match: result.match });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/loans/:loanId
 * Get details for a specific loan.
 */
router.get("/:loanId", async (req: Request, res: Response) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const loan = await loanManager.getLoanDetails(loanId);
    return res.json(loan);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/loans/:loanId/repay
 * Confirm repayment after x402 payment processed offchain.
 */
router.post("/:loanId/repay", async (req: Request, res: Response) => {
  try {
    const loanId = parseInt(req.params.loanId);
    const result = await loanManager.confirmRepayment(loanId);
    if (!result.success) return res.status(400).json({ error: result.error });
    return res.json({ success: true, loanId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
