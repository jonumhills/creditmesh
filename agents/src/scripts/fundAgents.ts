/**
 * fundAgents.ts
 *
 * Funds all agent wallets on Ethereum Sepolia:
 *   - All agents  → USDC (for lending/borrowing)
 *   - Lenders     → small ETH top-up (for approve + deposit + setTerms gas)
 *
 * Amounts:
 *   Lenders   → 0.012 USDC + 0.005 ETH (gas)
 *   Borrowers → 0.008 USDC
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
const TESTNET_RPC      = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com";
const LENDER_USDC      = "0.012";
const BORROWER_USDC    = "0.008";
const LENDER_ETH       = "0.005";   // gas for approve + deposit + setTerms
const MIN_USDC         = "0.003";
const MIN_ETH          = "0.002";   // skip ETH top-up if already above this
const USDC_DECIMALS    = 6;

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
  const deployerEth  = await provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`  USDC: ${ethers.formatUnits(deployerUsdc, USDC_DECIMALS)}`);
  console.log(`  ETH:  ${ethers.formatEther(deployerEth)}\n`);

  for (const agent of agents) {
    const isLender    = agent.role === "LENDER";
    const targetUsdc  = isLender ? LENDER_USDC : BORROWER_USDC;
    const currentUsdc = parseFloat(ethers.formatUnits(
      await usdcContract.balanceOf(agent.wallet.address), USDC_DECIMALS
    ));

    console.log(`\n[${agent.name}] (${agent.role}) — ${agent.wallet.address}`);

    // ── USDC ──────────────────────────────────────────────────────────────────
    if (currentUsdc >= parseFloat(MIN_USDC)) {
      console.log(`  ⏭  USDC: ${currentUsdc.toFixed(4)} — already funded, skipping`);
    } else {
      const needed = ethers.parseUnits(targetUsdc, USDC_DECIMALS);
      const deployerBal = await usdcContract.balanceOf(deployer.address);
      if (deployerBal < needed) {
        console.log(`  ⚠  Deployer low on USDC, skipping`);
      } else {
        const tx = await usdcContract.connect(deployer).transfer(agent.wallet.address, needed);
        await tx.wait();
        console.log(`  ✓ USDC: sent ${targetUsdc} — tx: ${tx.hash}`);
      }
    }

    // ── ETH (lenders only for gas) ────────────────────────────────────────────
    if (isLender) {
      const currentEth = parseFloat(ethers.formatEther(
        await provider.getBalance(agent.wallet.address)
      ));
      if (currentEth >= parseFloat(MIN_ETH)) {
        console.log(`  ⏭  ETH:  ${currentEth.toFixed(4)} — already has gas, skipping`);
      } else {
        const ethAmount = ethers.parseEther(LENDER_ETH);
        const tx = await deployer.sendTransaction({
          to:    agent.wallet.address,
          value: ethAmount,
        });
        await tx.wait();
        console.log(`  ✓ ETH:  sent ${LENDER_ETH} ETH — tx: ${tx.hash}`);
      }
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  // ── Final balances ────────────────────────────────────────────────────────
  console.log("\n── Final Balances ──────────────────────────────────────────────");
  console.log("Name               Role       USDC       ETH");
  console.log("────────────────────────────────────────────────────────────────");
  for (const agent of agents) {
    const usdc = parseFloat(ethers.formatUnits(
      await usdcContract.balanceOf(agent.wallet.address), USDC_DECIMALS
    ));
    const eth = parseFloat(ethers.formatEther(
      await provider.getBalance(agent.wallet.address)
    ));
    const ok = usdc >= parseFloat(MIN_USDC) ? "✓" : "✗";
    console.log(`${ok} ${agent.name.padEnd(18)} ${agent.role.padEnd(10)} ${usdc.toFixed(4)} USDC  ${eth.toFixed(4)} ETH`);
  }

  const finalEth  = await provider.getBalance(deployer.address);
  const finalUsdc = await usdcContract.balanceOf(deployer.address);
  console.log(`\nDeployer remaining: ${ethers.formatEther(finalEth)} ETH  |  ${ethers.formatUnits(finalUsdc, USDC_DECIMALS)} USDC`);
  console.log("\nNext: npm run agents:bootstrap\n");
}

main().catch(console.error);
