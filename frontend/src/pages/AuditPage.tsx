import { useState, useEffect } from "react";
import { api } from "../utils/api";

interface AuditData {
  contracts: Record<string, { address: string; explorerUrl: string; verified?: boolean }>;
  deployer: string;
  network: { name: string; chainId: number; blockNumber: number };
  stats: {
    totalAgents: number;
    activeLenders: number;
    totalLoans: number;
    activeLoans: number;
    repaidLoans: number;
    defaultedLoans: number;
    defaultRate: string;
    totalLiquidityEth: string;
    activePrincipalEth: string;
  };
  recentEvents: any[];
}

const EXPLORER = "https://testnet.arcscan.app";

export function AuditPage() {
  const [data, setData]       = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    api.get<AuditData>("/audit")
      .then((r) => { setData(r.data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="w-8 h-8 border-2 border-okx-border border-t-okx-orange rounded-full animate-spin" />
    </div>
  );

  if (error || !data) return (
    <div className="mx-5 mt-6 px-4 py-3 rounded border border-red-900 bg-red-950/30 text-red-400 text-xs">
      {error || "Failed to load audit data"}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-5 py-8 pb-16 space-y-8">

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Onchain Audit</h2>
        <p className="text-okx-muted text-sm">
          Live verification of CreditMesh smart contracts on Arc · Block{" "}
          <span className="text-white font-mono">#{data.network.blockNumber.toLocaleString()}</span>
        </p>
      </div>

      {/* Contract Addresses */}
      <Section title="Deployed Contracts">
        <div className="space-y-2">
          {Object.entries(data.contracts).map(([name, info]) => (
            <div key={name} className="flex items-center justify-between px-4 py-3 rounded-lg bg-okx-card border border-okx-border">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium">{name}</span>
                  {info.verified && <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-900">✓ Verified</span>}
                </div>
                <div className="text-okx-dim font-mono text-xs mt-0.5">{info.address}</div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={info.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1 rounded text-xs border border-okx-border text-okx-muted hover:text-white hover:border-okx-border2 transition-colors"
                >
                  View on Explorer ↗
                </a>
                <a
                  href={`${EXPLORER}/address/${info.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1 rounded text-xs bg-okx-orange/10 text-okx-orange border border-okx-orange/20 hover:bg-okx-orange/20 transition-colors"
                >
                  Transactions ↗
                </a>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-okx-card border border-okx-border">
            <div>
              <div className="text-okx-muted text-sm">Deployer / Platform Owner</div>
              <div className="text-white font-mono text-xs mt-0.5">{data.deployer}</div>
            </div>
            <a
              href={`${EXPLORER}/address/${data.deployer}`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1 rounded text-xs border border-okx-border text-okx-muted hover:text-white transition-colors"
            >
              View ↗
            </a>
          </div>
        </div>
      </Section>

      {/* Protocol Stats */}
      <Section title="Protocol Health">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          <StatCard label="Total Agents"    value={data.stats.totalAgents} />
          <StatCard label="Active Lenders"  value={data.stats.activeLenders} />
          <StatCard label="Total Loans"     value={data.stats.totalLoans} />
          <StatCard label="Loans Repaid"    value={data.stats.repaidLoans} color="text-okx-green" />
          <StatCard label="Defaults"        value={data.stats.defaultedLoans} color={data.stats.defaultedLoans > 0 ? "text-okx-red" : "text-okx-green"} />
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <StatCard label="Default Rate"       value={`${data.stats.defaultRate}%`} color={parseFloat(data.stats.defaultRate) > 10 ? "text-okx-red" : "text-okx-green"} />
          <StatCard label="Total Liquidity"    value={`${data.stats.totalLiquidityEth} USDC`} />
          <StatCard label="Active Principal"   value={`${data.stats.activePrincipalEth} USDC`} />
        </div>
      </Section>

      {/* Recent Events */}
      <Section title={`Recent Onchain Events (last 1000 blocks)`}>
        {data.recentEvents.length === 0 ? (
          <div className="text-center py-10 text-okx-dim text-sm">No events yet — agents are running</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-okx-border text-okx-dim">
                  <th className="text-left px-3 py-2 font-medium">Event</th>
                  <th className="text-left px-3 py-2 font-medium">Details</th>
                  <th className="text-right px-3 py-2 font-medium">Block</th>
                  <th className="text-right px-3 py-2 font-medium">Tx</th>
                </tr>
              </thead>
              <tbody>
                {data.recentEvents.map((ev, i) => (
                  <tr key={i} className="border-b border-okx-border hover:bg-okx-card transition-colors">
                    <td className="px-3 py-2.5">
                      <EventBadge type={ev.type} />
                    </td>
                    <td className="px-3 py-2.5 text-okx-muted">
                      <EventDetails ev={ev} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-okx-dim">
                      #{ev.blockNumber}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <a
                        href={`${EXPLORER}/tx/${ev.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-okx-orange hover:underline font-mono"
                      >
                        {ev.txHash.slice(0, 8)}...{ev.txHash.slice(-6)} ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Verification note */}
      <div className="px-4 py-3 rounded-lg border border-okx-border bg-okx-card text-xs text-okx-muted">
        <span className="text-white font-medium">Source Verification: </span>
        All contracts deployed on Arc Testnet (chainId 5042002). Contract source available at{" "}
        <a href="https://github.com/jonumhills/creditmesh/tree/main/contracts/contracts" target="_blank" rel="noreferrer" className="text-okx-orange hover:underline">
          github.com/jonumhills/creditmesh ↗
        </a>
      </div>

    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-okx-muted uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

function StatCard({ label, value, color = "text-white" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="px-4 py-3 rounded-lg bg-okx-card border border-okx-border">
      <div className="text-okx-dim text-[10px] mb-1">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

function EventBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    LoanCreated:  "bg-orange-950 text-orange-400 border-orange-900",
    LoanRepaid:   "bg-emerald-950 text-emerald-400 border-emerald-900",
    LoanDefaulted:"bg-red-950 text-red-400 border-red-900",
    ScoreUpdated: "bg-purple-950 text-purple-400 border-purple-900",
  };
  return (
    <span className={`px-2 py-0.5 rounded border text-[10px] font-medium whitespace-nowrap ${styles[type] || "bg-okx-card2 text-okx-muted border-okx-border"}`}>
      {type}
    </span>
  );
}

function EventDetails({ ev }: { ev: any }) {
  if (ev.type === "LoanCreated") return (
    <span>Loan #{ev.loanId} · <span className="font-mono">{ev.principal} USDC</span> · {ev.borrower?.slice(0,8)}...</span>
  );
  if (ev.type === "LoanRepaid") return (
    <span>Loan #{ev.loanId} · <span className="font-mono">{ev.amount} USDC</span> · {ev.onTime ? <span className="text-okx-green">on time</span> : <span className="text-yellow-400">late</span>}</span>
  );
  if (ev.type === "ScoreUpdated") return (
    <span>{ev.agent?.slice(0,8)}... · score {ev.oldScore} → <span className={ev.newScore > ev.oldScore ? "text-okx-green" : "text-okx-red"}>{ev.newScore}</span></span>
  );
  return <span>{JSON.stringify(ev).slice(0, 60)}</span>;
}
