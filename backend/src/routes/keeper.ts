import { Router, Request, Response } from "express";
import { LoanManager } from "../services/loanManager";

const router = Router();
const loanManager = new LoanManager();

// Track last run metadata for the status endpoint
let lastRun: { timestamp: string; defaulted: number[]; error?: string } | null = null;

function verifySecret(req: Request): boolean {
  const secret = process.env.KEEPERHUB_WEBHOOK_SECRET;
  if (!secret) return true; // no secret set → allow (dev mode)
  const auth = req.headers.authorization || "";
  return auth === `Bearer ${secret}`;
}

/**
 * POST /api/keeper/trigger
 * Called by KeeperHub every 5 minutes.
 * Scans all ACTIVE loans and marks expired ones as DEFAULTED onchain.
 */
router.post("/trigger", async (req: Request, res: Response) => {
  if (!verifySecret(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const ts = new Date().toISOString();
  try {
    const defaulted = await loanManager.checkAndMarkDefaults();
    lastRun = { timestamp: ts, defaulted };

    if (defaulted.length > 0) {
      console.log(`[KeeperHub] Marked ${defaulted.length} loan(s) defaulted:`, defaulted);
    }

    return res.json({
      success: true,
      timestamp: ts,
      defaultedLoans: defaulted,
      count: defaulted.length,
    });
  } catch (err: any) {
    lastRun = { timestamp: ts, defaulted: [], error: err.message };
    console.error("[KeeperHub] trigger error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/keeper/status
 * Returns registered job info and last execution result.
 */
router.get("/status", (_req: Request, res: Response) => {
  return res.json({
    service: "KeeperHub",
    jobName: "creditmesh-default-monitor",
    schedule: "*/5 * * * *",
    description: "Scans active loans every 5 min and calls LoanEscrow.markDefault() for expired ones",
    webhookUrl: `${process.env.BACKEND_URL || "https://creditmeshbackend-production.up.railway.app"}/api/keeper/trigger`,
    lastRun: lastRun || { timestamp: null, defaulted: [], message: "No runs yet" },
  });
});

export default router;
