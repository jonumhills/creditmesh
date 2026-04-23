import { Router, Request, Response } from "express";
import { getRegistryContract, getTrustScoreContract, getLoanEscrowContract, getProvider } from "../utils/blockchain";
import { ethers } from "ethers";
import { getName } from "../utils/agentNames";

const router = Router();

/**
 * GET /api/agents
 * List all registered agents with their trust scores.
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const registry = getRegistryContract(getProvider());
    const tsContract = getTrustScoreContract(getProvider());
    const escrow = getLoanEscrowContract(getProvider());

    const allAddresses: string[] = await registry.getAllAgents();

    const agents = await Promise.all(
      allAddresses.map(async (addr) => {
        const profile = await registry.getAgent(addr);
        const score = await tsContract.getScore(addr);
        const tier = await tsContract.getAccessTier(addr);

        const roleMap: Record<number, string> = { 0: "UNREGISTERED", 1: "LENDER", 2: "BORROWER" };
        return {
          wallet: addr,
          name: getName(addr) || null,
          role: roleMap[Number(profile.role)] || "UNKNOWN",
          kycPassed: profile.kycPassed,
          active: profile.active,
          trustScore: Number(score),
          tier,
          registeredAt: new Date(Number(profile.registeredAt) * 1000).toISOString(),
        };
      })
    );

    return res.json({ total: agents.length, agents });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/agents/leaderboard
 * Top agents ranked by trust score.
 */
router.get("/leaderboard", async (_req: Request, res: Response) => {
  try {
    const registry = getRegistryContract(getProvider());
    const tsContract = getTrustScoreContract(getProvider());
    const allAddresses: string[] = await registry.getAllAgents();

    const scores = await Promise.all(
      allAddresses.map(async (addr) => {
        const score = await tsContract.getScore(addr);
        const profile = await registry.getAgent(addr);
        const roleMap: Record<number, string> = { 0: "UNREGISTERED", 1: "LENDER", 2: "BORROWER" };
        return {
          wallet: addr,
          name: getName(addr) || null,
          trustScore: Number(score),
          role: roleMap[Number(profile.role)] || "UNKNOWN",
          kycPassed: profile.kycPassed,
        };
      })
    );

    scores.sort((a, b) => b.trustScore - a.trustScore);
    return res.json({ leaderboard: scores.slice(0, 20) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/agents/:wallet
 * Get detailed profile for a specific agent.
 */
router.get("/:wallet", async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;
    const registry = getRegistryContract(getProvider());
    const tsContract = getTrustScoreContract(getProvider());
    const escrow = getLoanEscrowContract(getProvider());

    const profile = await registry.getAgent(wallet);
    const fullScore = await tsContract.getFullScore(wallet);
    const tier = await tsContract.getAccessTier(wallet);
    const loans = Number(profile.role) === 2
      ? await escrow.getBorrowerLoans(wallet)
      : await escrow.getLenderLoans(wallet);

    const roleMap: Record<number, string> = { 0: "UNREGISTERED", 1: "LENDER", 2: "BORROWER" };

    return res.json({
      wallet,
      name: getName(wallet) || null,
      role: roleMap[Number(profile.role)] || "UNKNOWN",
      kycPassed: profile.kycPassed,
      active: profile.active,
      registeredAt: new Date(Number(profile.registeredAt) * 1000).toISOString(),
      trustScore: {
        value: Number(fullScore.value),
        tier,
        loanCount: Number(fullScore.loanCount),
        repaidCount: Number(fullScore.repaidCount),
        defaultCount: Number(fullScore.defaultCount),
        lastUpdated: Number(fullScore.lastUpdated) > 0
          ? new Date(Number(fullScore.lastUpdated) * 1000).toISOString()
          : null,
      },
      loanIds: loans.map(Number),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
