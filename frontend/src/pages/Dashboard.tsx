import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAgents, fetchActiveLenders, fetchLeaderboard, runKYA } from "../utils/api";
import type { Agent, LenderTerms } from "../utils/api";
import { StatsRow } from "../components/StatsRow";
import { AgentTable } from "../components/AgentTable";
import { LenderTable } from "../components/LenderTable";
import { KYAChecks } from "../components/KYAChecks";
import type { Tab } from "../App";

interface Props {
  tab: Tab;
  onTabChange: (t: Tab) => void;
}

export function Dashboard({ tab, onTabChange }: Props) {
  const navigate = useNavigate();
  const [agents, setAgents]       = useState<Agent[]>([]);
  const [lenders, setLenders]     = useState<LenderTerms[]>([]);
  const [leaderboard, setLeaderboard] = useState<Agent[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [kyaRunning, setKyaRunning]   = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [a, l, lb] = await Promise.all([
        fetchAgents(),
        fetchActiveLenders(),
        fetchLeaderboard(),
      ]);
      setAgents(a.agents);
      setLenders(l.lenders);
      setLeaderboard(lb.leaderboard);
      setLastRefresh(new Date());
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const handleRunKYA = async (wallet: string) => {
    setKyaRunning(wallet);
    try {
      await runKYA(wallet);
      await refresh();
    } catch { /* surface via refresh */ }
    finally { setKyaRunning(null); }
  };

  const borrowers     = agents.filter((a) => a.role === "BORROWER");
  const lenderAgents  = agents.filter((a) => a.role === "LENDER");
  const kyaPassed     = agents.filter((a) => a.kycPassed).length;
  const totalLiquidity = lenders.reduce((s, l) => s + parseFloat(l.availableLiquidity), 0).toString();

  const displayAgents: Agent[] =
    tab === "lenders"   ? lenderAgents :
    tab === "borrowers" ? borrowers :
    agents;

  const secondsAgo = Math.round((Date.now() - lastRefresh.getTime()) / 1000);

  return (
    <div className="min-h-screen bg-okx-bg text-white">

      {/* ── Hero banner ─────────────────────────────────── */}
      <div className="relative grid-bg border-b border-okx-border px-6 py-10 text-center overflow-hidden">
        {/* orange radial glow */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse 60% 40% at 50% 100%, rgba(249,115,22,0.10) 0%, transparent 70%)"
        }} />
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-okx-border bg-okx-card2 text-okx-muted text-xs mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-okx-orange animate-pulse" />
            Circle x Arc Hackathon · Agentic Economy · Agent Credit Network
          </div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">CreditMesh</h1>
          <p className="text-okx-muted text-sm max-w-md mx-auto mb-6">
            A peer-to-peer credit network where AI agents lend, borrow, and build reputation autonomously using USDC on Arc.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button className="btn-lend px-5 py-2 text-sm">View Live Dashboard →</button>
            <a
              href="https://github.com/jonumhills/creditmesh"
              target="_blank"
              rel="noreferrer"
              className="btn-outline px-5 py-2 text-sm"
            >GitHub ↗</a>
            <button
              className="btn-outline px-5 py-2 text-sm"
              onClick={() => navigate("/audit")}
            >Onchain Audit ↗</button>
          </div>
        </div>
      </div>

      {/* ── Architecture diagram ─────────────────────────── */}
      <div className="border-b border-okx-border px-6 py-5 bg-okx-card">
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <FlowNode label="AI Agent" sub="POST /api/kya/register" color="bg-okx-card2 border-okx-border2" />
          <Arrow />
          <FlowNode label="KYA Engine" sub="Trust Score 0–100" color="bg-orange-950 border-orange-900" highlight />
          <Arrow />
          <FlowNode label="Arc Testnet" sub="AgentRegistry · TrustScore · LoanEscrow" color="bg-okx-card2 border-okx-border2" />
          <Arrow />
          <FlowNode label="LoanEscrow" sub="USDC disbursement" color="bg-emerald-950 border-emerald-900" />
        </div>
        <p className="text-center text-okx-dim text-[10px] mt-3">The agent cannot participate unless KYA score ≥ 41.</p>
      </div>

      {/* ── Stats row ────────────────────────────────────────────────────── */}
      <StatsRow
        totalAgents={agents.length}
        lenderCount={lenderAgents.length}
        borrowerCount={borrowers.length}
        totalLiquidity={totalLiquidity}
        kyaPassed={kyaPassed}
        agents={agents}
      />

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-5 py-2 border-b border-okx-border bg-okx-bg">
        {(["all", "lenders", "borrowers", "leaderboard"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            className={`px-4 py-1.5 rounded text-xs font-medium transition-colors capitalize ${
              tab === t
                ? "bg-okx-orange text-white"
                : "text-okx-muted hover:text-white"
            }`}
          >
            {t === "all" ? `All Agents (${agents.length})` :
             t === "lenders" ? `Lenders (${lenderAgents.length})` :
             t === "borrowers" ? `Borrowers (${borrowers.length})` :
             "Leaderboard"}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 text-[10px] text-okx-dim">
          {kyaRunning && (
            <span className="text-okx-orange animate-pulse">Running KYA...</span>
          )}
          <span>Updated {secondsAgo}s ago</span>
          <button onClick={refresh} className="btn-outline py-1 text-[10px]">↻ Refresh</button>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div className="mx-5 mt-3 px-4 py-3 rounded border border-red-900 bg-red-950/30 text-red-400 text-xs">
          {error} — Make sure the CreditMesh backend is reachable.
        </div>
      )}

      {/* ── Table content ────────────────────────────────────────────────── */}
      <div className="bg-okx-bg">
        {tab === "leaderboard" ? (
          <LeaderboardTable leaderboard={leaderboard} loading={loading} />
        ) : tab === "lenders" ? (
          <LenderTable lenders={lenders} loading={loading} />
        ) : (
          <AgentTable
            agents={displayAgents}
            onRunKYA={handleRunKYA}
            loading={loading}
          />
        )}
      </div>

      {/* ── Bottom status bar ────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 h-7 bg-okx-card border-t border-okx-border flex items-center px-5 gap-6 text-[10px] text-okx-dim z-40">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-okx-orange" />
          Arc Testnet · chainId 5042002
        </span>
        <span>AgentRegistry <code className="text-okx-muted">0xe02C...920F</code></span>
        <span>TrustScore <code className="text-okx-muted">0x51ee...82CE</code></span>
        <span>LoanEscrow <code className="text-okx-muted">0xA542...50Eb</code></span>
        <span className="ml-auto">{agents.length} agents · {kyaPassed} KYA passed</span>
      </div>

      {/* spacer for fixed bottom bar */}
      <div className="h-7" />
    </div>
  );
}

// ── Leaderboard table ──────────────────────────────────────────────────────

function LeaderboardTable({ leaderboard, loading }: { leaderboard: Agent[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-okx-dim">
        <div className="w-8 h-8 border-2 border-okx-border border-t-okx-orange rounded-full animate-spin" />
      </div>
    );
  }
  if (leaderboard.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-okx-dim">
        <div className="text-4xl mb-3 opacity-30">◎</div>
        <div className="text-sm text-okx-muted">No records found</div>
      </div>
    );
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-okx-border text-okx-dim">
          <th className="text-left px-4 py-2.5 font-medium w-10">#</th>
          <th className="text-left px-4 py-2.5 font-medium">Agent</th>
          <th className="text-right px-4 py-2.5 font-medium">Trust Score</th>
          <th className="text-left px-4 py-2.5 font-medium">Verification</th>
          <th className="text-right px-4 py-2.5 font-medium pr-5">Role</th>
        </tr>
      </thead>
      <tbody>
        {leaderboard.map((agent, i) => (
          <tr key={agent.wallet} className="border-b border-okx-border table-row-hover">
            <td className="px-4 py-2.5 text-okx-dim font-mono">
              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
            </td>
            <td className="px-4 py-2.5 text-okx-muted font-mono">
              {agent.wallet.slice(0, 10)}...{agent.wallet.slice(-6)}
            </td>
            <td className="px-4 py-2.5 text-right">
              <span className={`font-semibold text-sm ${
                agent.trustScore >= 81 ? "text-okx-green" :
                agent.trustScore >= 61 ? "text-okx-orange" :
                agent.trustScore >= 41 ? "text-yellow-400" : "text-okx-red"
              }`}>{agent.trustScore}</span>
              <span className="text-okx-dim text-[10px]">/100</span>
            </td>
            <td className="px-4 py-2.5">
              <KYAChecks
                kycPassed={agent.kycPassed}
                trustScore={agent.trustScore}
                role={agent.role}
                active={agent.active}
                compact
              />
            </td>
            <td className="px-4 py-2.5 pr-5 text-right">
              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${agent.role === "LENDER" ? "bg-orange-950 text-orange-400" : "bg-purple-950 text-purple-400"}`}>
                {agent.role}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Flow diagram components ────────────────────────────────────────────────

function FlowNode({ label, sub, color, highlight }: { label: string; sub: string; color: string; highlight?: boolean }) {
  return (
    <div className={`border rounded-lg px-4 py-3 text-center min-w-[130px] ${color} ${highlight ? "shadow-lg shadow-orange-950/40" : ""}`}>
      <div className={`text-sm font-semibold ${highlight ? "text-okx-orange" : "text-white"}`}>{label}</div>
      <div className="text-[10px] text-okx-dim mt-0.5">{sub}</div>
    </div>
  );
}

function Arrow() {
  return <span className="text-okx-dim text-lg">→</span>;
}
