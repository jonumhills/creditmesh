import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LenderTerms } from "../utils/api";

interface Props {
  lenders: LenderTerms[];
  loading?: boolean;
}

type SortKey = "availableLiquidity" | "interestRatePct" | "minBorrowerScore" | "maxLoanSize";
type SortDir = "asc" | "desc";

const EXPLORER = "https://testnet.arcscan.app";
const short = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

export function LenderTable({ lenders, loading }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("availableLiquidity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const navigate = useNavigate();

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sorted = [...lenders].sort((a, b) => {
    const av = parseFloat(String(a[sortKey]));
    const bv = parseFloat(String(b[sortKey]));
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const SortTh = ({ col, children }: { col: SortKey; children: React.ReactNode }) => (
    <th
      onClick={() => toggleSort(col)}
      className="text-right px-4 py-2.5 font-medium cursor-pointer select-none hover:text-white transition-colors"
    >
      {children}
      <span className="ml-1 opacity-50">{sortKey === col ? (sortDir === "asc" ? "↑" : "↓") : "⇅"}</span>
    </th>
  );

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 text-okx-dim">
      <div className="w-8 h-8 border-2 border-okx-border border-t-okx-orange rounded-full animate-spin mb-3" />
      <span className="text-sm">Loading lenders...</span>
    </div>
  );

  if (lenders.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24 text-okx-dim">
      <div className="text-4xl mb-3 opacity-30">◎</div>
      <div className="text-sm text-okx-muted mb-1">No active lenders</div>
      <div className="text-xs text-okx-dim">Lenders appear here after depositing liquidity</div>
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-okx-border text-okx-dim">
            <th className="text-left px-4 py-2.5 font-medium w-6"></th>
            <th className="text-left px-4 py-2.5 font-medium min-w-[160px]">Lender</th>
            <SortTh col="availableLiquidity">Available</SortTh>
            <SortTh col="maxLoanSize">Max Loan</SortTh>
            <SortTh col="interestRatePct">Interest</SortTh>
            <SortTh col="minBorrowerScore">Min Score</SortTh>
            <th className="text-right px-4 py-2.5 font-medium">Max Duration</th>
            <th className="text-left px-4 py-2.5 font-medium">Terms</th>
            <th className="text-right px-4 py-2.5 font-medium pr-5">Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((lender) => (
            <tr key={lender.lender} className="border-b border-okx-border table-row-hover transition-colors">
              <td className="px-4 py-2.5 text-okx-dim">
                <span className="cursor-pointer hover:text-okx-orange transition-colors">☆</span>
              </td>

              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-orange-950 text-orange-400 flex items-center justify-center text-xs font-bold">⬆</div>
                  <div>
                    <a href={`${EXPLORER}/address/${lender.lender}`} target="_blank" rel="noreferrer"
                      className="text-white font-medium font-mono hover:text-okx-orange transition-colors">
                      {short(lender.lender)}
                    </a>
                    <div className="text-okx-dim text-[10px] mt-0.5">LENDER</div>
                  </div>
                </div>
              </td>

              <td className="px-4 py-2.5 text-right">
                <div className="text-white font-semibold">{parseFloat(lender.availableLiquidity).toFixed(4)}</div>
                <div className="text-okx-dim text-[10px]">USDC</div>
              </td>

              <td className="px-4 py-2.5 text-right">
                <div className="text-okx-muted">{parseFloat(lender.maxLoanSize).toFixed(4)}</div>
                <div className="text-okx-dim text-[10px]">USDC</div>
              </td>

              <td className="px-4 py-2.5 text-right">
                <div className="text-okx-green font-semibold">{lender.interestRatePct.toFixed(1)}%</div>
                <div className="text-okx-dim text-[10px]">APR</div>
              </td>

              <td className="px-4 py-2.5 text-right">
                <ScorePill score={lender.minBorrowerScore} />
              </td>

              <td className="px-4 py-2.5 text-right text-okx-muted">{lender.maxDurationDays}d</td>

              <td className="px-4 py-2.5">
                <div className="flex gap-1">
                  <span className="tag-green">Verified</span>
                  <span className={lender.active ? "tag-green" : "tag-gray"}>{lender.active ? "Active" : "Inactive"}</span>
                </div>
              </td>

              <td className="px-4 py-2.5 pr-5 text-right">
                <button onClick={() => navigate("/connect")} className="btn-buy">⚡ Borrow</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  const cls = score >= 81 ? "tag-green" : score >= 61 ? "tag-orange" : score >= 41 ? "tag-yellow" : "tag-red";
  return <span className={cls}>{score}+</span>;
}
