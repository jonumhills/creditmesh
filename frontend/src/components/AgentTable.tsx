import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent } from "../utils/api";
import { KYAChecks } from "./KYAChecks";

interface Props {
  agents: Agent[];
  onRunKYA?: (wallet: string) => void;
  loading?: boolean;
}

type SortKey = "wallet" | "trustScore" | "registeredAt";
type SortDir = "asc" | "desc";

const EXPLORER = "https://testnet.arcscan.app";
const short = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
const roleIcon = (role: string) => role === "LENDER" ? "⬆" : "⬇";
const scoreBg = (score: number) => {
  if (score >= 81) return "text-okx-green font-semibold";
  if (score >= 61) return "text-okx-orange font-semibold";
  if (score >= 41) return "text-yellow-400 font-semibold";
  if (score > 0)   return "text-okx-red font-semibold";
  return "text-okx-dim";
};

export function AgentTable({ agents, onRunKYA, loading }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("trustScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [copied, setCopied]   = useState<string | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sorted = [...agents].sort((a, b) => {
    let av: any, bv: any;
    if (sortKey === "trustScore")   { av = a.trustScore; bv = b.trustScore; }
    else if (sortKey === "registeredAt") { av = new Date(a.registeredAt).getTime(); bv = new Date(b.registeredAt).getTime(); }
    else { av = a.wallet; bv = b.wallet; }
    return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  const copyAddr = (addr: string) => {
    navigator.clipboard?.writeText(addr);
    setCopied(addr);
    setTimeout(() => setCopied(null), 1500);
  };

  const SortTh = ({ col, children, right }: { col: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`px-4 py-2.5 font-medium cursor-pointer select-none hover:text-white transition-colors ${right ? "text-right" : "text-left"}`}
    >
      {children}
      <span className="ml-1 opacity-50">{sortKey === col ? (sortDir === "asc" ? "↑" : "↓") : "⇅"}</span>
    </th>
  );

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 text-okx-dim">
      <div className="w-8 h-8 border-2 border-okx-border border-t-okx-orange rounded-full animate-spin mb-3" />
      <span className="text-sm">Loading onchain data...</span>
    </div>
  );

  if (agents.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24 text-okx-dim">
      <div className="text-4xl mb-3 opacity-30">◎</div>
      <div className="text-sm text-okx-muted mb-1">No records found</div>
      <div className="text-xs text-okx-dim">Agents will appear here once registered on-chain</div>
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-okx-border text-okx-dim">
            <th className="text-left px-4 py-2.5 font-medium w-6"></th>
            <SortTh col="wallet">Agent / Registered</SortTh>
            <SortTh col="trustScore" right>Trust Score</SortTh>
            <th className="text-left px-4 py-2.5 font-medium">KYA Checks</th>
            <th className="text-right px-4 py-2.5 font-medium">Role</th>
            <th className="text-right px-4 py-2.5 font-medium">Status</th>
            <th className="text-right px-4 py-2.5 font-medium pr-5">Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((agent) => (
            <AgentRow
              key={agent.wallet}
              agent={agent}
              onRunKYA={onRunKYA}
              copied={copied}
              onCopy={copyAddr}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentRow({ agent, onRunKYA, copied, onCopy }: {
  agent: Agent;
  onRunKYA?: (w: string) => void;
  copied: string | null;
  onCopy: (addr: string) => void;
}) {
  const navigate = useNavigate();
  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  };

  return (
    <tr className="border-b border-okx-border table-row-hover transition-colors">
      <td className="px-4 py-2.5 text-okx-dim">
        <span className="cursor-pointer hover:text-okx-orange transition-colors">☆</span>
      </td>

      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${agent.role === "LENDER" ? "bg-orange-950 text-orange-400" : "bg-purple-950 text-purple-400"}`}>
            {agent.name ? agent.name.slice(0, 2).toUpperCase() : roleIcon(agent.role)}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              {agent.name && <span className="text-white font-medium">{agent.name}</span>}
              <a href={`${EXPLORER}/address/${agent.wallet}`} target="_blank" rel="noreferrer"
                className={`hover:text-okx-orange transition-colors font-mono ${agent.name ? "text-okx-dim text-[10px]" : "text-white font-medium"}`}>
                {short(agent.wallet)}
              </a>
              <button
                onClick={() => onCopy(agent.wallet)}
                className="text-okx-dim hover:text-okx-muted transition-colors text-[10px]"
                title="Copy address"
              >{copied === agent.wallet ? <span className="text-okx-green">✓</span> : "⊕"}</button>
            </div>
            <div className="text-okx-dim text-[10px] mt-0.5">{timeAgo(agent.registeredAt)} ago · {agent.role}</div>
          </div>
        </div>
      </td>

      <td className="px-4 py-2.5 text-right">
        {agent.trustScore > 0 ? (
          <div>
            <div className={`text-base leading-tight ${scoreBg(agent.trustScore)}`}>{agent.trustScore}</div>
            <div className="text-okx-dim text-[10px]">/100</div>
          </div>
        ) : <span className="text-okx-dim">—</span>}
      </td>

      <td className="px-4 py-2.5">
        <KYAChecks kycPassed={agent.kycPassed} trustScore={agent.trustScore} role={agent.role} active={agent.active} compact />
      </td>

      <td className="px-4 py-2.5 text-right">
        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${agent.role === "LENDER" ? "bg-orange-950 text-orange-400" : "bg-purple-950 text-purple-400"}`}>
          {agent.role}
        </span>
      </td>

      <td className="px-4 py-2.5 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${agent.active ? "bg-okx-green" : "bg-okx-dim"}`} />
          <span className={agent.active ? "text-okx-green" : "text-okx-dim"}>
            {agent.active ? "Active" : "Inactive"}
          </span>
        </div>
      </td>

      <td className="px-4 py-2.5 pr-5 text-right">
        {!agent.kycPassed ? (
          <button
            onClick={() => onRunKYA?.(agent.wallet)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium border border-okx-border2 text-okx-muted hover:border-okx-orange hover:text-okx-orange transition-colors"
          >Run KYA</button>
        ) : agent.role === "LENDER" ? (
          <button onClick={() => navigate("/connect")} className="btn-lend">⚡ Deposit</button>
        ) : (
          <button onClick={() => navigate("/connect")} className="btn-buy">⚡ Borrow</button>
        )}
      </td>
    </tr>
  );
}
