import axios from "axios";

const API_BASE = "/api";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

export interface Agent {
  wallet: string;
  name: string | null;
  role: "LENDER" | "BORROWER" | "UNREGISTERED";
  kycPassed: boolean;
  active: boolean;
  trustScore: number;
  tier: string;
  registeredAt: string;
}

export interface LenderTerms {
  lender: string;
  availableLiquidity: string;
  maxLoanSize: string;
  minBorrowerScore: number;
  interestRateBps: number;
  interestRatePct: number;
  maxDurationDays: number;
  active: boolean;
}

export interface Loan {
  id: number;
  lender: string;
  borrower: string;
  principal: string;
  interestBps: number;
  interestPct: number;
  startTime: string;
  dueTime: string;
  totalDue: string;
  status: string;
}

export const fetchAgents = () =>
  api.get<{ total: number; agents: Agent[] }>("/agents").then((r) => r.data);

export const fetchLeaderboard = () =>
  api.get<{ leaderboard: Agent[] }>("/agents/leaderboard").then((r) => r.data);

export const fetchAgent = (wallet: string) =>
  api.get<Agent & { trustScore: any; loanIds: number[] }>(`/agents/${wallet}`).then((r) => r.data);

export const fetchActiveLenders = () =>
  api.get<{ lenders: LenderTerms[] }>("/loans/lenders/active").then((r) => r.data);

export const fetchLoan = (loanId: number) =>
  api.get<Loan>(`/loans/${loanId}`).then((r) => r.data);

export const runKYA = (wallet: string) =>
  api.post("/kya/score", { wallet }).then((r) => r.data);

export const registerAgent = (wallet: string, role: "LENDER" | "BORROWER") =>
  api.post("/kya/register", { wallet, role }).then((r) => r.data);

export const fetchHealth = () =>
  api.get("/health").then((r) => r.data);
