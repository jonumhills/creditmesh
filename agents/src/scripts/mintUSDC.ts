/**
 * mintUSDC.ts — mints MockUSDC directly to each agent wallet.
 * Deployer is MockUSDC owner so can call mint(address, amount).
 *
 * Amounts:
 *   Lenders   → 0.025 USDC  (covers deposit + buffer)
 *   Borrowers → 0.012 USDC  (covers small test loans)
 *
 * Run: ts-node --transpile-only src/scripts/mintUSDC.ts
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: require("path").join(__dirname, "../../../.env") });

const AGENTS_FILE   = path.join(__dirname, "../../agents.json");
const TESTNET_RPC   = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com";
const USDC_DECIMALS = 6;

const MINT_ABI = [
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address owner) external view returns (uint256)",
];

const LENDER_USDC   = "0.025";
const BORROWER_USDC = "0.012";
const MIN_USDC      = "0.003";

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║      CreditMesh — Mint USDC           ║");
  console.log("╚══════════════════════════════════════╝\n");

  const usdcAddress = process.env.USDC_TOKEN_ADDRESS;
  if (!usdcAddress) throw new Error("USDC_TOKEN_ADDRESS not set");

  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!deployerKey) throw new Error("DEPLOYER_PRIVATE_KEY not set");

  const agents   = JSON.parse(fs.readFileSync(AGENTS_FILE, "utf-8"));
  const provider = new ethers.JsonRpcProvider(TESTNET_RPC);
  const deployer = new ethers.Wallet(deployerKey, provider);
  const usdc     = new ethers.Contract(usdcAddress, MINT_ABI, deployer);

  console.log(`Deployer (owner): ${deployer.address}\n`);

  for (const agent of agents) {
    const isLender  = agent.role === "LENDER";
    const target    = isLender ? LENDER_USDC : BORROWER_USDC;
    const current   = parseFloat(ethers.formatUnits(
      await usdc.balanceOf(agent.wallet.address), USDC_DECIMALS
    ));

    process.stdout.write(`[${agent.name}] current: ${current.toFixed(4)} USDC — `);

    if (current >= parseFloat(MIN_USDC)) {
      console.log("already funded, skipping");
      continue;
    }

    const amount = ethers.parseUnits(target, USDC_DECIMALS);
    const tx     = await usdc.mint(agent.wallet.address, amount);
    await tx.wait();
    console.log(`minted ${target} USDC ✓  (tx: ${tx.hash})`);

    await new Promise((r) => setTimeout(r, 800));
  }

  console.log("\n── Final Balances ─────────────────────────────────────");
  for (const agent of agents) {
    const bal = parseFloat(ethers.formatUnits(
      await usdc.balanceOf(agent.wallet.address), USDC_DECIMALS
    ));
    const ok  = bal >= parseFloat(MIN_USDC) ? "✓" : "✗";
    console.log(`${ok} ${agent.name.padEnd(18)} ${agent.role.padEnd(10)} ${bal.toFixed(4)} USDC`);
  }

  console.log("\nNext: npm run agents:bootstrap\n");
}

main().catch(console.error);
