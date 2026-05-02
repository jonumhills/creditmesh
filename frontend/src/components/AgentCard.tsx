import { TrustScoreBadge } from "./TrustScoreBadge";
import type { Agent } from "../utils/api";

interface Props {
  agent: Agent;
  onClick?: () => void;
}

export function AgentCard({ agent, onClick }: Props) {
  const short = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div
      className="bg-xlayer-card border border-xlayer-border rounded-lg p-4 cursor-pointer hover:border-blue-600 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${agent.active ? "bg-green-400" : "bg-gray-500"}`} />
          <span className="text-xs text-gray-400 font-mono">{short(agent.wallet)}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded font-mono ${agent.role === "LENDER" ? "bg-blue-900 text-blue-300" : "bg-purple-900 text-purple-300"}`}>
          {agent.role}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <TrustScoreBadge score={agent.trustScore} />
        {agent.kycPassed ? (
          <span className="text-xs text-green-400">KYA ✓</span>
        ) : (
          <span className="text-xs text-gray-500">KYA pending</span>
        )}
      </div>

      <div className="mt-2 text-xs text-gray-500">
        Registered {new Date(agent.registeredAt).toLocaleDateString()}
      </div>
    </div>
  );
}
