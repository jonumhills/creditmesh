/**
 * uniswap.ts
 *
 * Uniswap v3 swap helper for CreditMesh borrower agents.
 * Agents borrow USDC → swap to WETH → swap back to USDC to simulate yield.
 *
 * Uses Uniswap Trading API for quotes + ethers.js for execution on Sepolia.
 */

import { ethers } from "ethers";
import axios from "axios";

// ── Sepolia addresses ──────────────────────────────────────────────────────────
export const SEPOLIA = {
  USDC:        "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
  WETH:        "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  SWAP_ROUTER: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
  chainId:     11155111,
};

const UNISWAP_API = "https://trade-api.gateway.uniswap.org/v1";

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];

const SWAP_ROUTER_ABI = [
  `function exactInputSingle((
    address tokenIn,
    address tokenOut,
    uint24 fee,
    address recipient,
    uint256 amountIn,
    uint256 amountOutMinimum,
    uint160 sqrtPriceLimitX96
  ) params) external payable returns (uint256 amountOut)`,
];

// ── Get a swap quote from Uniswap Trading API ─────────────────────────────────

export async function getSwapQuote(params: {
  tokenIn:   string;
  tokenOut:  string;
  amountIn:  string;  // human-readable (e.g. "0.005")
  decimalsIn: number;
  swapper:   string;
}): Promise<{ amountOut: string; priceImpact: string } | { error: string }> {
  try {
    const amountRaw = ethers.parseUnits(params.amountIn, params.decimalsIn).toString();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const apiKey = process.env.UNISWAP_API_KEY;
    if (apiKey) headers["x-api-key"] = apiKey;

    const res = await axios.post(`${UNISWAP_API}/quote`, {
      tokenInChainId:  SEPOLIA.chainId,
      tokenOutChainId: SEPOLIA.chainId,
      tokenIn:         params.tokenIn,
      tokenOut:        params.tokenOut,
      amount:          amountRaw,
      type:            "EXACT_INPUT",
      swapper:         params.swapper,
    }, { headers, timeout: 10000 });

    const quote = res.data;
    return {
      amountOut:   quote.quote?.amount || "0",
      priceImpact: quote.quote?.priceImpact || "0",
    };
  } catch (err: any) {
    return { error: err.response?.data?.errorCode || err.message };
  }
}

// ── Execute USDC → WETH swap via Uniswap v3 ──────────────────────────────────

export async function swapUsdcToWeth(
  signer: ethers.Wallet,
  amountUsdc: string   // human-readable, e.g. "0.003"
): Promise<{ success: boolean; txHash?: string; amountOut?: string; error?: string }> {
  try {
    const provider    = signer.provider!;
    const usdc        = new ethers.Contract(SEPOLIA.USDC, ERC20_ABI, signer);
    const swapRouter  = new ethers.Contract(SEPOLIA.SWAP_ROUTER, SWAP_ROUTER_ABI, signer);

    const amountIn = ethers.parseUnits(amountUsdc, 6);

    // Approve router
    const allowance = await usdc.allowance(signer.address, SEPOLIA.SWAP_ROUTER);
    if (allowance < amountIn) {
      const approveTx = await usdc.approve(SEPOLIA.SWAP_ROUTER, amountIn);
      await approveTx.wait();
    }

    // Execute swap
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
    const tx = await swapRouter.exactInputSingle({
      tokenIn:             SEPOLIA.USDC,
      tokenOut:            SEPOLIA.WETH,
      fee:                 3000,           // 0.3% pool
      recipient:           signer.address,
      amountIn,
      amountOutMinimum:    0,
      sqrtPriceLimitX96:   0,
    });

    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (err: any) {
    return { success: false, error: err.shortMessage || err.message?.slice(0, 100) };
  }
}

// ── Execute WETH → USDC swap (close position) ────────────────────────────────

export async function swapWethToUsdc(
  signer: ethers.Wallet,
  amountWeth: string   // human-readable, e.g. "0.000001"
): Promise<{ success: boolean; txHash?: string; amountOut?: string; error?: string }> {
  try {
    const weth       = new ethers.Contract(SEPOLIA.WETH, ERC20_ABI, signer);
    const swapRouter = new ethers.Contract(SEPOLIA.SWAP_ROUTER, SWAP_ROUTER_ABI, signer);

    const amountIn = ethers.parseUnits(amountWeth, 18);

    const allowance = await weth.allowance(signer.address, SEPOLIA.SWAP_ROUTER);
    if (allowance < amountIn) {
      const approveTx = await weth.approve(SEPOLIA.SWAP_ROUTER, amountIn);
      await approveTx.wait();
    }

    const tx = await swapRouter.exactInputSingle({
      tokenIn:           SEPOLIA.WETH,
      tokenOut:          SEPOLIA.USDC,
      fee:               3000,
      recipient:         signer.address,
      amountIn,
      amountOutMinimum:  0,
      sqrtPriceLimitX96: 0,
    });

    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (err: any) {
    return { success: false, error: err.shortMessage || err.message?.slice(0, 100) };
  }
}

// ── Get WETH balance ──────────────────────────────────────────────────────────

export async function getWethBalance(provider: ethers.Provider, address: string): Promise<string> {
  const weth = new ethers.Contract(SEPOLIA.WETH, ERC20_ABI, provider);
  const bal  = await weth.balanceOf(address);
  return ethers.formatUnits(bal, 18);
}
