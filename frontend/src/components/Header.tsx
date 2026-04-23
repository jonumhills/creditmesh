import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { fetchHealth } from "../utils/api";
import type { Tab } from "../App";

export function Header() {
  const [networkOk, setNetworkOk] = useState<boolean | null>(null);
  const [blockTime, setBlockTime]  = useState<string>("");
  const location    = useLocation();
  const navigate    = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = (searchParams.get("tab") as Tab) || "all";
  const isDashboard = location.pathname === "/";

  useEffect(() => {
    const check = () =>
      fetchHealth()
        .then(() => { setNetworkOk(true); setBlockTime(new Date().toLocaleTimeString()); })
        .catch(() => setNetworkOk(false));
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, []);

  const setTab = (t: Tab) => {
    if (!isDashboard) navigate("/");
    setTimeout(() => setSearchParams(t === "all" ? {} : { tab: t }), isDashboard ? 0 : 50);
  };

  return (
    <header className="border-b border-okx-border bg-okx-bg sticky top-0 z-50">
      <div className="flex items-center justify-between px-5 h-12">

        {/* Logo */}
        <div className="flex items-center gap-6">
          <NavLink to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-okx-orange rounded flex items-center justify-center text-white font-bold text-xs">CM</div>
            <span className="font-semibold text-white text-sm tracking-tight">CreditMesh</span>
          </NavLink>

          <nav className="hidden md:flex items-center gap-5 text-okx-muted text-sm">
            <NavLink to="/" end className={({ isActive }) => `cursor-pointer transition-colors ${isActive ? "text-white font-medium" : "hover:text-white"}`}>Dashboard</NavLink>
            <NavLink to="/loans"   className={({ isActive }) => `cursor-pointer transition-colors ${isActive ? "text-white font-medium" : "hover:text-white"}`}>Loans</NavLink>
            <NavLink to="/audit"   className={({ isActive }) => `cursor-pointer transition-colors ${isActive ? "text-white font-medium" : "hover:text-white"}`}>Onchain Audit</NavLink>
            <NavLink
              to="/connect"
              className={({ isActive }) =>
                `cursor-pointer transition-colors ${isActive ? "text-white font-medium" : "hover:text-white"}`
              }
            >Connect Agent</NavLink>
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-4 text-xs text-okx-muted border-r border-okx-border pr-3">
            <span>Arc Testnet</span>
            {blockTime && <span className="text-okx-dim">{blockTime}</span>}
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <div className={`w-1.5 h-1.5 rounded-full ${networkOk === null ? "bg-yellow-500" : networkOk ? "bg-okx-green animate-pulse" : "bg-okx-red"}`} />
            <span className={networkOk === null ? "text-yellow-400" : networkOk ? "text-okx-green" : "text-okx-red"}>
              {networkOk === null ? "Connecting" : networkOk ? "Live" : "Offline"}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-okx-card2 border border-okx-border rounded px-3 py-1.5 text-xs text-white">
            <div className="w-4 h-4 rounded-full bg-okx-orange flex items-center justify-center text-[9px] font-bold">A</div>
            <span>CreditMesh</span>
          </div>
        </div>
      </div>

      {/* Sub-nav — only visible on Dashboard */}
      <div className={`flex items-center gap-1 px-5 h-9 border-t border-okx-border overflow-x-auto ${isDashboard ? "" : "invisible pointer-events-none"}`}>
        <TabPill active={tab === "all"}         onClick={() => setTab("all")}>All Agents</TabPill>
        <TabPill active={tab === "lenders"}     onClick={() => setTab("lenders")}>Lenders</TabPill>
        <TabPill active={tab === "borrowers"}   onClick={() => setTab("borrowers")}>Borrowers</TabPill>
        <TabPill active={tab === "leaderboard"} onClick={() => setTab("leaderboard")}>Leaderboard</TabPill>
      </div>
    </header>
  );
}

function TabPill({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
        active ? "bg-okx-orange text-white" : "text-okx-muted hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
