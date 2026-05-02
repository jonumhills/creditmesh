import { Router, Request, Response } from "express";
import { TrustScoreEngine } from "../kya/trustScoreEngine";
import { getRegistryContract, getTrustScoreContract, getSigner, getProvider } from "../utils/blockchain";
import { setName } from "../utils/agentNames";

const router = Router();
const engine = new TrustScoreEngine();

/**
 * POST /api/kya/register
 * Register a new agent and initiate KYA.
 * Body: { wallet: string, role: "LENDER" | "BORROWER" }
 */
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { wallet, role, name } = req.body;
    if (!wallet || !role) {
      return res.status(400).json({ error: "wallet and role required" });
    }
    const roleEnum = role === "LENDER" ? 1 : role === "BORROWER" ? 2 : null;
    if (!roleEnum) return res.status(400).json({ error: "role must be LENDER or BORROWER" });

    const registry = getRegistryContract(getSigner());
    const tx = await registry.register(wallet, roleEnum);
    await tx.wait();

    if (name) setName(wallet, name);

    return res.json({ success: true, wallet, role, name: name || null, message: "Agent registered. Run KYA to get trust score." });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/kya/score
 * Compute and write a trust score for an agent.
 * Body: { wallet: string }
 */
router.post("/score", async (req: Request, res: Response) => {
  try {
    const { wallet } = req.body;
    if (!wallet) return res.status(400).json({ error: "wallet required" });

    // Get onchain loan history from TrustScore contract
    const tsContract = getTrustScoreContract(getProvider());
    const fullScore = await tsContract.getFullScore(wallet);
    const onchainHistory = {
      loanCount: Number(fullScore.loanCount),
      repaidCount: Number(fullScore.repaidCount),
      defaultCount: Number(fullScore.defaultCount),
    };

    // Compute score
    const breakdown = await engine.computeScore(wallet, onchainHistory);

    // Write score onchain
    const tsWriter = getTrustScoreContract(getSigner());
    const tx = await tsWriter.setScore(wallet, breakdown.total);
    await tx.wait();

    // Mark KYA passed if score >= 41
    if (breakdown.total >= 41) {
      const registry = getRegistryContract(getSigner());
      try {
        await (await registry.markKYAPassed(wallet)).wait();
      } catch { /* may already be set */ }
    }

    return res.json({ success: true, wallet, ...breakdown });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/kya/score/:wallet
 * Get current trust score for an agent.
 */
router.get("/score/:wallet", async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;
    const tsContract = getTrustScoreContract(getProvider());
    const score = await tsContract.getScore(wallet);
    const fullScore = await tsContract.getFullScore(wallet);
    const tier = await tsContract.getAccessTier(wallet);

    return res.json({
      wallet,
      score: Number(score),
      tier,
      loanCount: Number(fullScore.loanCount),
      repaidCount: Number(fullScore.repaidCount),
      defaultCount: Number(fullScore.defaultCount),
      lastUpdated: new Date(Number(fullScore.lastUpdated) * 1000).toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
