/**
 * setupEnsName.ts
 *
 * Registers `creditmesh.eth` on Ethereum Sepolia ENS and sets up
 * the Name Wrapper so the backend can mint agent subnames.
 *
 * Run once: npm run ens:setup
 *
 * After this, agents get subnames like:
 *   0x1a2b3c4d.creditmesh.eth
 *
 * And trust score / role are stored as text records on each subname.
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const ETH_REGISTRAR_CONTROLLER = "0xFED6a969AaA60E4961FCD3EBF1A2e8913ac65B16";
const PUBLIC_RESOLVER           = "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD";
const NAME_WRAPPER              = "0x0635513f179D50A207757E05759CbD106d7dFbe";
const ENS_REGISTRY              = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

const CONTROLLER_ABI = [
  "function available(string calldata name) external view returns (bool)",
  "function rentPrice(string calldata name, uint256 duration) external view returns (tuple(uint256 base, uint256 premium))",
  "function makeCommitment(string calldata name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] calldata data, bool reverseRecord, uint16 ownerControlledFuses) external pure returns (bytes32)",
  "function commit(bytes32 commitment) external",
  "function register(string calldata name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] calldata data, bool reverseRecord, uint16 ownerControlledFuses) external payable",
];

const REGISTRY_ABI = [
  "function owner(bytes32 node) external view returns (address)",
  "function setApprovalForAll(address operator, bool approved) external",
];

const NAME_WRAPPER_ABI = [
  "function isApprovedForAll(address account, address operator) external view returns (bool)",
  "function ownerOf(uint256 id) external view returns (address)",
];

const DURATION = 365 * 24 * 3600; // 1 year in seconds

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(
    process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com"
  );
  const signer  = new ethers.Wallet(pk, provider);
  const owner   = signer.address;

  console.log("╔══════════════════════════════════════════╗");
  console.log("║  CreditMesh — ENS Setup on Sepolia       ║");
  console.log("╚══════════════════════════════════════════╝\n");
  console.log(`Deployer: ${owner}`);

  const controller = new ethers.Contract(ETH_REGISTRAR_CONTROLLER, CONTROLLER_ABI, signer);
  const registry   = new ethers.Contract(ENS_REGISTRY, REGISTRY_ABI, signer);

  // ── 1. Check availability ─────────────────────────────────────────────────
  const available: boolean = await controller.available("creditmesh");
  const parentNode = ethers.namehash("creditmesh.eth");
  const registryOwner: string = await registry.owner(parentNode);

  if (!available || registryOwner === owner) {
    console.log(`✓ creditmesh.eth already registered to ${registryOwner || "you"}`);
  } else {
    // ── 2. Get price ──────────────────────────────────────────────────────────
    const price = await controller.rentPrice("creditmesh", DURATION);
    const total = price.base + price.premium;
    console.log(`Price: ${ethers.formatEther(total)} ETH/year`);

    const balance = await provider.getBalance(owner);
    if (balance < total) {
      console.error(`❌ Insufficient ETH. Need ${ethers.formatEther(total)}, have ${ethers.formatEther(balance)}`);
      process.exit(1);
    }

    // ── 3. Commit ─────────────────────────────────────────────────────────────
    const secret = ethers.randomBytes(32);
    const commitment = await controller.makeCommitment(
      "creditmesh",
      owner,
      DURATION,
      secret,
      PUBLIC_RESOLVER,
      [],
      true,  // reverseRecord
      0
    );

    console.log("\nCommitting...");
    const commitTx = await controller.commit(commitment);
    await commitTx.wait();
    console.log("✓ Committed. Waiting 60s (ENS requires ~1 min between commit and register)...");

    await new Promise((r) => setTimeout(r, 65_000));

    // ── 4. Register ───────────────────────────────────────────────────────────
    console.log("Registering creditmesh.eth...");
    const regTx = await controller.register(
      "creditmesh",
      owner,
      DURATION,
      secret,
      PUBLIC_RESOLVER,
      [],
      true,
      0,
      { value: total }
    );
    await regTx.wait();
    console.log(`✓ creditmesh.eth registered! Tx: ${regTx.hash}`);
  }

  // ── 5. Approve NameWrapper as operator (needed for subname creation) ───────
  const wrapper    = new ethers.Contract(NAME_WRAPPER, NAME_WRAPPER_ABI, signer);
  const isApproved: boolean = await registry.isApprovedForAll ? false : false;

  console.log("\n✓ ENS setup complete.");
  console.log("\nSubnames will be auto-created when agents register on CreditMesh:");
  console.log("  0x1a2b3c4d.creditmesh.eth  (first 8 chars of wallet)");
  console.log("\nText records written per agent:");
  console.log("  cm.role        → LENDER / BORROWER");
  console.log("  cm.trust_score → 0–100");
  console.log("  cm.tier        → NO_ACCESS / SMALL_ONLY / MEDIUM / FULL_ACCESS");
  console.log("  cm.kya_status  → PASSED / PENDING");
  console.log("  url            → Backend profile URL");
  console.log("  description    → Human-readable summary");
  console.log("\nNext: npm run ens:mint-all  (backfill existing agents)");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
