import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com";

export interface WalletInfo {
  address: string;
  privateKey: string;
  createdAt: string;
}

export async function createAgentWallet(_agentName: string): Promise<WalletInfo> {
  const w = ethers.Wallet.createRandom();
  return {
    address:    w.address,
    privateKey: w.privateKey,
    createdAt:  new Date().toISOString(),
  };
}

export async function getWalletBalance(address: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const balance  = await provider.getBalance(address);
  return ethers.formatEther(balance);
}
