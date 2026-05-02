/**
 * mintAgentSubnames.ts
 *
 * Backfills ENS subnames + text records for all already-registered agents.
 * Run after setupEnsName.ts has completed.
 *
 * Run: npm run ens:mint-all
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../../../.env") });

import { getRegistryContract, getTrustScoreContract, getProvider } from "../utils/blockchain";
import { ensService } from "../services/ensService";

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  CreditMesh — Mint Agent ENS Subnames    ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const registry  = getRegistryContract(getProvider());
  const tsContract = getTrustScoreContract(getProvider());
  const allAgents: string[] = await registry.getAllAgents();

  console.log(`Found ${allAgents.length} registered agents.\n`);

  for (const wallet of allAgents) {
    const profile = await registry.getAgent(wallet);
    const score   = await tsContract.getScore(wallet);
    const tier    = await tsContract.getAccessTier(wallet);

    const roleMap: Record<number, string> = { 0: "UNREGISTERED", 1: "LENDER", 2: "BORROWER" };
    const role = roleMap[Number(profile.role)] || "UNKNOWN";
    const label = wallet.slice(2, 10).toLowerCase();
    const ensName = `${label}.creditmesh.eth`;

    console.log(`\nAgent: ${wallet}`);
    console.log(`  Role: ${role} | Score: ${score} | Tier: ${tier}`);

    // Create subname
    console.log(`  Creating subname: ${ensName}`);
    const created = await ensService.createSubname(label, wallet);
    if (created) {
      console.log(`  ✓ Subname created: ${created}`);
    } else {
      console.log(`  ⚠ Subname creation skipped (may already exist or creditmesh.eth not set up)`);
    }

    // Write text records on the subname
    if (Number(score) > 0) {
      console.log(`  Writing text records on ${ensName}...`);
      const txHash = await ensService.setAgentTextRecords(ensName, {
        role,
        trustScore: Number(score),
        tier,
        kyaStatus: profile.kycPassed ? "PASSED" : "PENDING",
        wallet,
      });
      if (txHash) console.log(`  ✓ Text records written. Tx: ${txHash}`);
      else console.log(`  ⚠ Text record write skipped (deployer may not control the name)`);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n✓ Done. All agents have ENS subnames under creditmesh.eth");
}

main().catch(console.error);
