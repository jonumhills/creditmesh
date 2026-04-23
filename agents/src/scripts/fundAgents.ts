/**
 * fundAgents.ts
 *
 * Funds all 11 agent wallets with testnet USDC on Arc.
 *
 * Strategy:
 *   1. Try Arc testnet faucet for native gas tokens (if available)
 *   2. Transfer USDC from the deployer wallet to each agent
 *      — use the Arc testnet USDC faucet or deployer balance
 *
 * Amounts (USDC, 6 decimals):
 *   Lenders   → 0.012 USDC  (deposit + gas)
 *   Borrowers → 0.008 USDC  (gas for registration + repayments)
 *
 * Run: npm run agents:fund
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: require("path").join(__dirname, "../../../.env") });

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address owner) external view returns (uint256)",
];

const AGENTS_FILE      = path.join(__dirname, "../../agents.json");
const TESTNET_RPC      = process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const LENDER_FUND      = "0.012";   // USDC
const BORROWER_FUND    = "0.008";   // USDC
const MIN_BALANCE      = "0.003";   // skip if already above this
const USDC_DECIMALS    = 6;

// ── USDC transfer from deployer ───────────────────────────────────────────────

async function fundWithUsdc(
  usdcContract: ethers.Contract,
  deployer: ethers.Wallet,
  toAddress: string,
  amountUsdc: string
): Promise<string> {
  const amount = ethers.parseUnits(amountUsdc, USDC_DECIMALS);
  const tx = await usdcContract.connect(deployer).transfer(toAddress, amount);
  await tx.wait();
  return tx.hash;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║      CreditMesh — Fund Agents         ║");
  console.log("╚══════════════════════════════════════╝\n");

  if (!fs.existsSync(AGENTS_FILE)) {
    console.error("❌ agents.json not found — run npm run agents:create first");
    process.exit(1);
  }

  const usdcAddress = process.env.USDC_TOKEN_ADDRESS;
  if (!usdcAddress) throw new Error("USDC_TOKEN_ADDRESS not set in .env");

  const agents   = JSON.parse(fs.readFileSync(AGENTS_FILE, "utf-8"));
  const provider = new ethers.JsonRpcProvider(TESTNET_RPC);

  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!deployerKey) throw new Error("DEPLOYER_PRIVATE_KEY not set");
  const deployer = new ethers.Wallet(deployerKey, provider);

  const usdcContract = new ethers.Contract(usdcAddress, ERC20_ABI, provider);

  const deployerUsdc = await usdcContract.balanceOf(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Deployer USDC balance: ${ethers.formatUnits(deployerUsdc, USDC_DECIMALS)} USDC\n`);

  for (const agent of agents) {
    const targetUsdc = agent.role === "LENDER" ? LENDER_FUND : BORROWER_FUND;
    const current    = await usdcContract.balanceOf(agent.wallet.address);
    const currentStr = parseFloat(ethers.formatUnits(current, USDC_DECIMALS));

    if (currentStr >= parseFloat(MIN_BALANCE)) {
      console.log(`⏭  ${agent.name} (${agent.role}) — already has ${currentStr.toFixed(4)} USDC, skipping`);
      continue;
    }

    console.log(`\n💸 Funding ${agent.name} (${agent.role}) → ${agent.wallet.address}`);
    console.log(`   Target: ${targetUsdc} USDC | Current: ${currentStr.toFixed(6)} USDC`);

    try {
      const deployerBal = await usdcContract.balanceOf(deployer.address);
      const needed      = ethers.parseUnits(targetUsdc, USDC_DECIMALS);

      if (deployerBal < needed) {
        console.log(`   ⚠ Deployer low on USDC (${ethers.formatUnits(deployerBal, USDC_DECIMALS)}), skipping`);
        continue;
      }

      const txHash = await fundWithUsdc(usdcContract, deployer, agent.wallet.address, targetUsdc);
      console.log(`   ✓ Sent ${targetUsdc} USDC — tx: ${txHash}`);
    } catch (err: any) {
      console.log(`   ❌ Transfer failed: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  // Final balance report
  console.log("\n── Final USDC Balances ─────────────────────────────────────────");
  for (const agent of agents) {
    const bal    = await usdcContract.balanceOf(agent.wallet.address);
    const amount = parseFloat(ethers.formatUnits(bal, USDC_DECIMALS));
    const icon   = amount >= parseFloat(MIN_BALANCE) ? "✓" : "✗";
    console.log(`${icon} ${agent.name.padEnd(18)} ${agent.role.padEnd(8)} ${amount.toFixed(6)} USDC   ${agent.wallet.address}`);
  }

  const deployerFinal = await usdcContract.balanceOf(deployer.address);
  console.log(`\nDeployer remaining: ${ethers.formatUnits(deployerFinal, USDC_DECIMALS)} USDC`);
  console.log("\nNext: npm run agents:bootstrap\n");
}

main().catch(console.error);
