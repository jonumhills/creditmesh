import { useState, useEffect, useCallback } from "react";
import { api } from "../utils/api";
import type { Loan } from "../utils/api";

const EXPLORER = "https://testnet.arcscan.app";
const short = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

type NameMap = Record<string, string>;

export function LoansPage() {
  const [loans, setLoans]     = useState<Loan[]>([]);
  const [names, setNames]     = useState<NameMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [filter, setFilter]   = useState<"ALL" | "ACTIVE" | "REPAID" | "DEFAULTED">("ALL");

  const load = useCallback(async () => {
    try {
      const [audit, agentsRes] = await Promise.all([
        api.get("/audit"),
        api.get("/agents"),
      ]);

      const nameMap: NameMap = {};
      for (const a of agentsRes.data.agents ?? []) {
        if (a.name) nameMap[a.wallet.toLowerCase()] = a.name;
      }
      setNames(nameMap);

      const total: number = audit.data.stats.totalLoans;
      if (total === 0) { setLoans([]); setLoading(false); return; }

      const results = await Promise.allSettled(
        Array.from({ length: total }, (_, i) => api.get<Loan>(`/loans/${i}`).then(r => r.data))
      );
      const loaded = results
        .filter((r): r is PromiseFulfilledResult<Loan> => r.status === "fulfilled")
        .map(r => r.value)
        .sort((a, b) => b.id - a.id);

      setLoans(loaded);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const filtered = filter === "ALL" ? loans : loans.filter(l => l.status === filter);
  const active   = loans.filter(l => l.status === "ACTIVE").length;
  const repaid   = loans.filter(l => l.status === "REPAID").length;
  const defaulted = loans.filter(l => l.status === "DEFAULTED").length;

  return (
    <div className="max-w-6xl mx-auto px-5 py-8 pb-24 space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Loans</h2>
        <p className="text-okx-muted text-sm">All loans created via CreditMesh on Arc</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Total Loans"   value={loans.length} />
        <SummaryCard label="Active"        value={active}   color="text-okx-orange" />
        <SummaryCard label="Repaid"        value={repaid}   color="text-okx-green" />
        <SummaryCard label="Defaulted"     value={defaulted} color={defaulted > 0 ? "text-okx-red" : "text-okx-green"} />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1">
        {(["ALL","ACTIVE","REPAID","DEFAULTED"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              filter === f ? "bg-okx-orange text-white" : "text-okx-muted hover:text-white"
            }`}
          >{f === "ALL" ? `All (${loans.length})` : `${f} (${loans.filter(l => l.status === f).length})`}</button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-okx-border border-t-okx-orange rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="px-4 py-3 rounded border border-red-900 bg-red-950/30 text-red-400 text-xs">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-okx-dim">
          <div className="text-4xl mb-3 opacity-30">◎</div>
          <div className="text-sm text-okx-muted">No {filter === "ALL" ? "" : filter.toLowerCase()} loans yet</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-okx-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-okx-border text-okx-dim bg-okx-card">
                <th className="text-left px-4 py-2.5 font-medium">ID</th>
                <th className="text-left px-4 py-2.5 font-medium">Borrower</th>
                <th className="text-left px-4 py-2.5 font-medium">Lender</th>
                <th className="text-right px-4 py-2.5 font-medium">Principal</th>
                <th className="text-right px-4 py-2.5 font-medium">Total Due</th>
                <th className="text-right px-4 py-2.5 font-medium">Interest</th>
                <th className="text-right px-4 py-2.5 font-medium">Due Date</th>
                <th className="text-center px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(loan => <LoanRow key={loan.id} loan={loan} names={names} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LoanRow({ loan, names }: { loan: Loan; names: NameMap }) {
  const nameOf = (addr: string) => names[addr.toLowerCase()];
  const due      = new Date(loan.dueTime);
  const now      = new Date();
  const msLeft   = due.getTime() - now.getTime();
  const isOverdue = msLeft < 0 && loan.status === "ACTIVE";

  const formatDue = () => {
    if (loan.status !== "ACTIVE") return due.toLocaleDateString();
    if (isOverdue) return "Overdue";
    const h = Math.floor(msLeft / 3600000);
    const m = Math.floor((msLeft % 3600000) / 60000);
    if (h > 48) return `${Math.floor(h / 24)}d left`;
    if (h > 0)  return `${h}h ${m}m left`;
    return `${m}m left`;
  };

  return (
    <tr className="border-b border-okx-border hover:bg-okx-card transition-colors">
      <td className="px-4 py-3 font-mono text-okx-muted">#{loan.id}</td>

      <td className="px-4 py-3">
        <AgentCell addr={loan.borrower} name={nameOf(loan.borrower)} color="text-okx-orange" />
      </td>

      <td className="px-4 py-3">
        <AgentCell addr={loan.lender} name={nameOf(loan.lender)} color="text-okx-muted" />
      </td>

      <td className="px-4 py-3 text-right">
        <div className="text-white font-semibold">{parseFloat(loan.principal).toFixed(4)}</div>
        <div className="text-okx-dim text-[10px]">USDC</div>
      </td>

      <td className="px-4 py-3 text-right">
        <div className="text-okx-muted">{parseFloat(loan.totalDue).toFixed(4)}</div>
        <div className="text-okx-dim text-[10px]">USDC</div>
      </td>

      <td className="px-4 py-3 text-right">
        <span className="text-okx-green">{loan.interestPct.toFixed(1)}%</span>
        <div className="text-okx-dim text-[10px]">APR</div>
      </td>

      <td className="px-4 py-3 text-right">
        <span className={isOverdue ? "text-okx-red" : loan.status === "ACTIVE" && msLeft < 3600000 ? "text-yellow-400" : "text-okx-muted"}>
          {formatDue()}
        </span>
      </td>

      <td className="px-4 py-3 text-center">
        <StatusBadge status={loan.status} />
      </td>
    </tr>
  );
}

function AgentCell({ addr, name, color }: { addr: string; name?: string; color: string }) {
  return (
    <div>
      {name && <div className={`font-medium text-xs ${color}`}>{name}</div>}
      <a href={`${EXPLORER}/address/${addr}`} target="_blank" rel="noreferrer"
        className={`font-mono hover:underline ${name ? "text-okx-dim text-[10px]" : `${color} text-xs`}`}>
        {short(addr)}
      </a>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE:    "bg-orange-950 text-orange-400 border-orange-900",
    REPAID:    "bg-emerald-950 text-emerald-400 border-emerald-900",
    DEFAULTED: "bg-red-950 text-red-400 border-red-900",
    PENDING:   "bg-yellow-950 text-yellow-400 border-yellow-900",
  };
  return (
    <span className={`px-2 py-0.5 rounded border text-[10px] font-medium ${styles[status] || "bg-okx-card text-okx-muted border-okx-border"}`}>
      {status}
    </span>
  );
}

function SummaryCard({ label, value, color = "text-white" }: { label: string; value: number; color?: string }) {
  return (
    <div className="px-4 py-3 rounded-lg bg-okx-card border border-okx-border">
      <div className="text-okx-dim text-[10px] mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
