/**
 * setAgentScore.ts
 *
 * Set trust score for a specific wallet address.
 * Run: npx tsx agents/src/scripts/setAgentScore.ts <wallet> <score>
 *
 * Example:
 *   npx tsx agents/src/scripts/setAgentScore.ts 0xbDB99ce5Db43a0DADDdFcf467F2a2D828094B00E 65
 */

import { ethers } from "ethers";
import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const TRUST_SCORE_ABI = [
  "function setScore(address agent, uint8 newScore) external",
  "function getScore(address agent) external view returns (uint8)",
];
const AGENT_REGISTRY_ABI = [
  "function markKYAPassed(address wallet) external",
  "function isKYAApproved(address wallet) external view returns (bool)",
];

async function main() {
  const wallet = process.argv[2];
  const score  = parseInt(process.argv[3] || "65");

  if (!wallet) {
    console.error("Usage: npx tsx setAgentScore.ts <wallet> <score>");
    process.exit(1);
  }

  const provider  = new ethers.JsonRpcProvider(process.env.XLAYER_TESTNET_RPC_URL || "https://testrpc.xlayer.tech");
  const deployer  = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);

  const tsContract  = new ethers.Contract(process.env.TRUST_SCORE_ADDRESS!,  TRUST_SCORE_ABI,    deployer);
  const regContract = new ethers.Contract(process.env.AGENT_REGISTRY_ADDRESS!, AGENT_REGISTRY_ABI, deployer);

  console.log(`Setting trust score for ${wallet} → ${score}`);

  const tx1 = await tsContract.setScore(wallet, score);
  await tx1.wait();
  console.log(`✓ Trust score set to ${score}`);

  try {
    const tx2 = await regContract.markKYAPassed(wallet);
    await tx2.wait();
    console.log(`✓ KYA marked as passed`);
  } catch {
    console.log(`⏭  KYA already marked`);
  }

  const current = await tsContract.getScore(wallet);
  console.log(`\nFinal score onchain: ${current}`);
  const tier =
    current >= 81 ? "FULL_ACCESS" :
    current >= 61 ? "MEDIUM" :
    current >= 41 ? "SMALL_ONLY" : "NO_ACCESS";
  console.log(`Tier: ${tier}`);
}

main().catch(console.error);
