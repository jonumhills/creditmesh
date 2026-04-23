import { Routes, Route, Navigate, useSearchParams } from "react-router-dom";
import { Header } from "./components/Header";
import { Dashboard } from "./pages/Dashboard";
import { AuditPage } from "./pages/AuditPage";
import { MCPSetupPage } from "./pages/MCPSetupPage";
import { LoansPage } from "./pages/LoansPage";

export type Tab = "all" | "lenders" | "borrowers" | "leaderboard";

function DashboardRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) || "all";
  const setTab = (t: Tab) => setSearchParams(t === "all" ? {} : { tab: t });
  return <Dashboard tab={tab} onTabChange={setTab} />;
}

function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/"        element={<DashboardRoute />} />
        <Route path="/loans"   element={<LoansPage />} />
        <Route path="/audit"   element={<AuditPage />} />
        <Route path="/connect" element={<MCPSetupPage />} />
        <Route path="*"        element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
