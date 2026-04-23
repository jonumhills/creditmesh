import { useState, useEffect } from "react";
import { api } from "../utils/api";
import type { Agent } from "../utils/api";

interface StatCard {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
  detail?: { label: string; value: string }[];
}

interface Props {
  totalAgents: number;
  lenderCount: number;
  borrowerCount: number;
  totalLiquidity: string;
  kyaPassed: number;
  agents: Agent[];
}

interface LoanStats {
  activeLoans: number;
  repaidLoans: number;
  defaultedLoans: number;
  defaultRate: string;
}

export function StatsRow({ totalAgents, lenderCount, borrowerCount, totalLiquidity, kyaPassed, agents }: Props) {
  const [loanStats, setLoanStats] = useState<LoanStats>({ activeLoans: 0, repaidLoans: 0, defaultedLoans: 0, defaultRate: "0.0" });

  useEffect(() => {
    api.get("/audit")
      .then((r: any) => {
        const s = r.data.stats;
        setLoanStats({ activeLoans: s.activeLoans, repaidLoans: s.repaidLoans, defaultedLoans: s.defaultedLoans, defaultRate: s.defaultRate });
      })
      .catch(() => {});
  }, []);

  const scored = agents.filter(a => a.trustScore > 0);
  const avgScore = scored.length > 0 ? Math.round(scored.reduce((s, a) => s + a.trustScore, 0) / scored.length) : null;
  const fullAccess = agents.filter(a => a.trustScore >= 81).length;
  const noAccess   = agents.filter(a => a.trustScore > 0 && a.trustScore < 41).length;

  const avgColor = avgScore == null ? "text-okx-dim" : avgScore >= 81 ? "text-okx-green" : avgScore >= 61 ? "text-okx-orange" : avgScore >= 41 ? "text-yellow-400" : "text-okx-red";

  const cards: StatCard[] = [
    {
      label: "Total Agents",
      value: totalAgents.toString(),
      sub: kyaPassed > 0 ? `+${kyaPassed} KYA passed` : "No agents yet",
      subColor: kyaPassed > 0 ? "text-okx-green" : "text-okx-dim",
      detail: [
        { label: "Lenders",   value: lenderCount.toString() },
        { label: "Borrowers", value: borrowerCount.toString() },
      ],
    },
    {
      label: "Total Liquidity",
      value: `${parseFloat(totalLiquidity).toFixed(4)} USDC`,
      sub: lenderCount > 0 ? `Across ${lenderCount} lenders` : "No liquidity yet",
      subColor: "text-okx-muted",
      detail: [
        { label: "Active lenders", value: lenderCount.toString() },
        { label: "Avg per lender", value: lenderCount > 0 ? `${(parseFloat(totalLiquidity) / lenderCount).toFixed(3)} USDC` : "—" },
      ],
    },
    {
      label: "KYA Pass Rate",
      value: totalAgents > 0 ? `${Math.round((kyaPassed / totalAgents) * 100)}%` : "0%",
      sub: `${kyaPassed} / ${totalAgents} agents verified`,
      subColor: kyaPassed > 0 ? "text-okx-green" : "text-okx-dim",
      detail: [
        { label: "KYA passed", value: kyaPassed.toString() },
        { label: "Pending",    value: (totalAgents - kyaPassed).toString() },
      ],
    },
    {
      label: "Active Loans",
      value: loanStats.activeLoans.toString(),
      sub: loanStats.activeLoans > 0 ? `${loanStats.repaidLoans} repaid · ${loanStats.defaultRate}% default rate` : "No active loans",
      subColor: loanStats.activeLoans > 0 ? "text-okx-green" : "text-okx-dim",
      detail: [
        { label: "Total repaid", value: loanStats.repaidLoans.toString() },
        { label: "Defaults",     value: loanStats.defaultedLoans.toString() },
      ],
    },
    {
      label: "Avg Trust Score",
      value: avgScore != null ? avgScore.toString() : "—",
      sub: avgScore != null ? `${scored.length} agents scored` : "No scores yet",
      subColor: avgColor,
      detail: [
        { label: "Full access (>80)", value: fullAccess.toString() },
        { label: "No access (<41)",   value: noAccess.toString() },
      ],
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px bg-okx-border border-b border-okx-border">
      {cards.map((card) => (
        <div key={card.label} className="bg-okx-bg p-4">
          <div className="flex items-start justify-between mb-1">
            <span className="text-okx-muted text-xs">{card.label}</span>
            <span className="text-okx-dim text-xs">ⓘ</span>
          </div>
          <div className={`font-semibold text-lg leading-tight mb-0.5 ${card.label === "Avg Trust Score" ? avgColor : "text-white"}`}>{card.value}</div>
          {card.sub && <div className={`text-xs ${card.subColor}`}>{card.sub}</div>}
          {card.detail && (
            <div className="mt-2 pt-2 border-t border-okx-border flex gap-4">
              {card.detail.map((d) => (
                <div key={d.label}>
                  <div className="text-okx-dim text-[10px]">{d.label}</div>
                  <div className="text-okx-muted text-xs">{d.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
