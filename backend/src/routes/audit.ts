import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import {
  getProvider,
  getLoanEscrowContract,
  getTrustScoreContract,
  getRegistryContract,
  LOAN_ESCROW_ABI,
  TRUST_SCORE_ABI,
  AGENT_REGISTRY_ABI,
} from "../utils/blockchain";

const router = Router();

const EXPLORER_BASE = "https://www.oklink.com/xlayer-test";
const DEPLOYMENTS = {
  AgentRegistry: process.env.AGENT_REGISTRY_ADDRESS || "",
  TrustScore:    process.env.TRUST_SCORE_ADDRESS    || "",
  LoanEscrow:    process.env.LOAN_ESCROW_ADDRESS    || "",
};

/**
 * GET /api/audit
 * Returns full protocol audit: contract info, live stats, recent events.
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const provider = getProvider();
    const escrow   = getLoanEscrowContract(provider);
    const ts       = getTrustScoreContract(provider);
    const registry = getRegistryContract(provider);

    // ── Live stats ──────────────────────────────────────────────────────────
    const [nextLoanId, activeLenders, allAgents, blockNumber] = await Promise.all([
      escrow.nextLoanId().catch(() => 0n),
      escrow.getActiveLenders(),
      registry.getAllAgents(),
      provider.getBlockNumber(),
    ]);

    const totalLoans = Number(nextLoanId);

    // Scan all loans for status breakdown
    let activeCount = 0, repaidCount = 0, defaultedCount = 0;
    let totalPrincipalEth = 0;

    for (let i = 0; i < Math.min(totalLoans, 50); i++) {
      try {
        const loan = await escrow.getLoan(i);
        const status = Number(loan.status);
        if (status === 1) { activeCount++;   totalPrincipalEth += parseFloat(ethers.formatEther(loan.principal)); }
        if (status === 2)   repaidCount++;
        if (status === 3)   defaultedCount++;
      } catch { /* skip */ }
    }

    // Total liquidity across active lenders
    let totalLiquidityEth = 0;
    for (const lender of activeLenders) {
      try {
        const terms = await escrow.lenderTerms(lender);
        totalLiquidityEth += parseFloat(ethers.formatEther(terms.availableLiquidity));
      } catch { /* skip */ }
    }

    // ── Recent events (last 1000 blocks) ────────────────────────────────────
    const fromBlock = Math.max(0, blockNumber - 1000);

    const [loanCreatedLogs, loanRepaidLogs, scoreUpdatedLogs] = await Promise.all([
      provider.getLogs({
        address: DEPLOYMENTS.LoanEscrow,
        topics: [ethers.id("LoanCreated(uint256,address,address,uint256)")],
        fromBlock,
        toBlock: "latest",
      }).catch(() => []),
      provider.getLogs({
        address: DEPLOYMENTS.LoanEscrow,
        topics: [ethers.id("LoanRepaid(uint256,address,uint256,bool)")],
        fromBlock,
        toBlock: "latest",
      }).catch(() => []),
      provider.getLogs({
        address: DEPLOYMENTS.TrustScore,
        topics: [ethers.id("ScoreUpdated(address,uint8,uint8,uint256)")],
        fromBlock,
        toBlock: "latest",
      }).catch(() => []),
    ]);

    const escrowIface   = new ethers.Interface(LOAN_ESCROW_ABI);
    const tsIface       = new ethers.Interface(TRUST_SCORE_ABI);

    const parseLog = (iface: ethers.Interface, log: ethers.Log) => {
      try { return iface.parseLog(log); } catch { return null; }
    };

    const events = [
      ...loanCreatedLogs.map((log) => {
        const parsed = parseLog(escrowIface, log);
        if (!parsed) return null;
        return {
          type: "LoanCreated",
          loanId: Number(parsed.args.loanId),
          lender: parsed.args.lender,
          borrower: parsed.args.borrower,
          principal: ethers.formatEther(parsed.args.principal),
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        };
      }).filter(Boolean),
      ...loanRepaidLogs.map((log) => {
        const parsed = parseLog(escrowIface, log);
        if (!parsed) return null;
        return {
          type: "LoanRepaid",
          loanId: Number(parsed.args.loanId),
          borrower: parsed.args.borrower,
          amount: ethers.formatEther(parsed.args.amount),
          onTime: parsed.args.onTime,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        };
      }).filter(Boolean),
      ...scoreUpdatedLogs.map((log) => {
        const parsed = parseLog(tsIface, log);
        if (!parsed) return null;
        return {
          type: "ScoreUpdated",
          agent: parsed.args.agent,
          oldScore: Number(parsed.args.oldScore),
          newScore: Number(parsed.args.newScore),
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
        };
      }).filter(Boolean),
    ]
      .sort((a: any, b: any) => b.blockNumber - a.blockNumber)
      .slice(0, 20);

    return res.json({
      contracts: {
        AgentRegistry: { address: DEPLOYMENTS.AgentRegistry, explorerUrl: `${EXPLORER_BASE}/address/${DEPLOYMENTS.AgentRegistry}#code`, verified: true },
        TrustScore:    { address: DEPLOYMENTS.TrustScore,    explorerUrl: `${EXPLORER_BASE}/address/${DEPLOYMENTS.TrustScore}#code`,    verified: true },
        LoanEscrow:    { address: DEPLOYMENTS.LoanEscrow,    explorerUrl: `${EXPLORER_BASE}/address/${DEPLOYMENTS.LoanEscrow}#code`,    verified: true },
      },
      deployer: "0xa4C397A81bf4Ec8e386418d39fd2D36efd524e64",
      network: { name: "X Layer Testnet", chainId: 1952, blockNumber },
      stats: {
        totalAgents:      allAgents.length,
        activeLenders:    activeLenders.length,
        totalLoans,
        activeLoans:      activeCount,
        repaidLoans:      repaidCount,
        defaultedLoans:   defaultedCount,
        defaultRate:      totalLoans > 0 ? ((defaultedCount / totalLoans) * 100).toFixed(1) : "0.0",
        totalLiquidityEth: totalLiquidityEth.toFixed(6),
        activePrincipalEth: totalPrincipalEth.toFixed(6),
      },
      recentEvents: events,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
