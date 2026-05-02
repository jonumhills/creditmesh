import axios from "axios";
import * as dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";

const client = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  timeout: 30000,
});

export async function registerAgent(wallet: string, role: "LENDER" | "BORROWER") {
  const res = await client.post("/kya/register", { wallet, role });
  return res.data;
}

export async function runKYA(wallet: string) {
  const res = await client.post("/kya/score", { wallet });
  return res.data;
}

export async function getTrustScore(wallet: string) {
  const res = await client.get(`/kya/score/${wallet}`);
  return res.data;
}

export async function requestLoan(params: {
  borrower: string;
  amountEth: string;
  durationDays: number;
  purpose: string;
}) {
  const res = await client.post("/loans/request", params);
  return res.data;
}

export async function getLoan(loanId: number) {
  const res = await client.get(`/loans/${loanId}`);
  return res.data;
}

export async function confirmRepayment(loanId: number) {
  const res = await client.post(`/loans/${loanId}/repay`);
  return res.data;
}

export async function getActiveLenders() {
  const res = await client.get("/loans/lenders/active");
  return res.data;
}

export async function getAgents() {
  const res = await client.get("/agents");
  return res.data;
}
