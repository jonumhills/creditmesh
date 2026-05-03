/**
 * getUSDC.ts — gets USDC for the deployer by:
 *   1. Wrapping 0.01 ETH → WETH
 *   2. Swapping WETH → USDC via Uniswap v3 on Sepolia
 *   3. Distributing USDC to each agent wallet
 *
 * Run: ts-node --transpile-only src/scripts/getUSDC.ts
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: require("path").join(__dirname, "../../../.env") });

const AGENTS_FILE   = path.join(__dirname, "../../agents.json");
const TESTNET_RPC   = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com";
const USDC_DECIMALS = 6;

const USDC        = ethers.getAddress("0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8");
const WETH        = ethers.getAddress("0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14");
const SWAP_ROUTER = ethers.getAddress("0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E");

const WETH_ABI = [
  "function deposit() external payable",
  "function balanceOf(address) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
];
const ERC20_ABI = [
  "function balanceOf(address) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
];
const ROUTER_ABI = [
  `function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)`,
];

const LENDER_USDC   = "0.025";
const BORROWER_USDC = "0.012";
const MIN_USDC      = "0.003";

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║   CreditMesh — Get USDC via Uniswap  ║");
  console.log("╚══════════════════════════════════════╝\n");

  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!deployerKey) throw new Error("DEPLOYER_PRIVATE_KEY not set");

  const agents   = JSON.parse(fs.readFileSync(AGENTS_FILE, "utf-8"));
  const provider = new ethers.JsonRpcProvider(TESTNET_RPC);
  const deployer = new ethers.Wallet(deployerKey, provider);

  const wethContract = new ethers.Contract(WETH, WETH_ABI, deployer);
  const usdcContract = new ethers.Contract(USDC, ERC20_ABI, deployer);
  const router       = new ethers.Contract(SWAP_ROUTER, ROUTER_ABI, deployer);

  console.log(`Deployer: ${deployer.address}`);
  const ethBal = await provider.getBalance(deployer.address);
  console.log(`  ETH:  ${ethers.formatEther(ethBal)}`);
  const usdcBal0 = await usdcContract.balanceOf(deployer.address);
  console.log(`  USDC: ${ethers.formatUnits(usdcBal0, USDC_DECIMALS)}\n`);

  // ── Step 1: Wrap ETH → WETH (skip if already have enough) ───────────────
  let wethBal = await wethContract.balanceOf(deployer.address);
  const minWeth = ethers.parseEther("0.009");
  if (wethBal >= minWeth) {
    console.log(`Step 1: Already have ${ethers.formatEther(wethBal)} WETH — skipping wrap\n`);
  } else {
    const wrapAmount = ethers.parseEther("0.01");
    console.log("Step 1: Wrapping 0.01 ETH → WETH...");
    const wrapTx = await wethContract.deposit({ value: wrapAmount });
    await wrapTx.wait();
    wethBal = await wethContract.balanceOf(deployer.address);
    console.log(`  ✓ WETH balance: ${ethers.formatEther(wethBal)} WETH  (tx: ${wrapTx.hash})\n`);
  }

  // ── Step 2: Approve router ────────────────────────────────────────────────
  console.log("Step 2: Approving router to spend WETH...");
  const approveTx = await wethContract.approve(SWAP_ROUTER, wethBal);
  await approveTx.wait();
  console.log(`  ✓ Approved  (tx: ${approveTx.hash})\n`);

  // ── Step 3: Swap WETH → USDC ──────────────────────────────────────────────
  console.log("Step 3: Swapping WETH → USDC via Uniswap v3...");
  const swapTx = await router.exactInputSingle({
    tokenIn:           WETH,
    tokenOut:          USDC,
    fee:               3000,   // 0.3% pool
    recipient:         deployer.address,
    amountIn:          wethBal,
    amountOutMinimum:  0,
    sqrtPriceLimitX96: 0,
  });
  await swapTx.wait();
  const usdcBal1 = await usdcContract.balanceOf(deployer.address);
  console.log(`  ✓ USDC received: ${ethers.formatUnits(usdcBal1, USDC_DECIMALS)} USDC  (tx: ${swapTx.hash})\n`);

  if (usdcBal1 === 0n) {
    console.error("❌ Swap produced 0 USDC — pool may have no liquidity on this Sepolia fork");
    process.exit(1);
  }

  // ── Step 4: Distribute USDC to agents ────────────────────────────────────
  console.log("Step 4: Distributing USDC to agents...\n");
  for (const agent of agents) {
    const isLender  = agent.role === "LENDER";
    const target    = isLender ? LENDER_USDC : BORROWER_USDC;
    const current   = parseFloat(ethers.formatUnits(
      await usdcContract.balanceOf(agent.wallet.address), USDC_DECIMALS
    ));

    process.stdout.write(`[${agent.name}] ${current.toFixed(4)} USDC — `);

    if (current >= parseFloat(MIN_USDC)) {
      console.log("already funded, skipping");
      continue;
    }

    const deployerCurrent = await usdcContract.balanceOf(deployer.address);
    const needed = ethers.parseUnits(target, USDC_DECIMALS);
    if (deployerCurrent < needed) {
      console.log(`deployer low on USDC (${ethers.formatUnits(deployerCurrent, USDC_DECIMALS)}), skipping`);
      continue;
    }

    const tx = await usdcContract.connect(deployer).transfer(agent.wallet.address, needed);
    await tx.wait();
    console.log(`sent ${target} USDC ✓`);
    await new Promise((r) => setTimeout(r, 800));
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log("\n── Final Balances ─────────────────────────────────────────────");
  console.log("Name               Role       USDC");
  console.log("──────────────────────────────────────");
  for (const agent of agents) {
    const bal = parseFloat(ethers.formatUnits(
      await usdcContract.balanceOf(agent.wallet.address), USDC_DECIMALS
    ));
    const ok  = bal >= parseFloat(MIN_USDC) ? "✓" : "✗";
    console.log(`${ok} ${agent.name.padEnd(18)} ${agent.role.padEnd(10)} ${bal.toFixed(4)} USDC`);
  }

  const finalDeployer = await usdcContract.balanceOf(deployer.address);
  console.log(`\nDeployer remaining: ${ethers.formatUnits(finalDeployer, USDC_DECIMALS)} USDC`);
  console.log("\nNext: npm run agents:bootstrap\n");
}

main().catch(console.error);
