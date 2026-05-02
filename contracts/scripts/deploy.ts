import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log("Deploying CreditMesh contracts with:", deployer.address);
  console.log("Network:", network.name, "chainId:", network.chainId.toString());
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "OG");

  // Sepolia: use real Uniswap test USDC. Arc: use native USDC. Others: require env var.
  let usdcAddress: string;
  const isSepolia = network.chainId === 11155111n;

  if (isSepolia) {
    // Uniswap's test USDC on Sepolia — has real liquidity in Uniswap v3 pools
    usdcAddress = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
    console.log("\nUsing Uniswap test USDC on Sepolia:", usdcAddress);
  } else {
    usdcAddress = process.env.USDC_TOKEN_ADDRESS!;
    if (!usdcAddress) throw new Error("USDC_TOKEN_ADDRESS not set in .env");
  }

  // 1. Deploy AgentRegistry
  console.log("\n1. Deploying AgentRegistry...");
  const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
  const registry = await AgentRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("   AgentRegistry deployed:", registryAddress);

  // 2. Deploy TrustScore
  console.log("\n2. Deploying TrustScore...");
  const TrustScore = await ethers.getContractFactory("TrustScore");
  const trustScore = await TrustScore.deploy();
  await trustScore.waitForDeployment();
  const trustScoreAddress = await trustScore.getAddress();
  console.log("   TrustScore deployed:", trustScoreAddress);

  // 3. Deploy LoanEscrow with USDC token address
  console.log("\n3. Deploying LoanEscrow...");
  const LoanEscrow = await ethers.getContractFactory("LoanEscrow");
  const loanEscrow = await LoanEscrow.deploy(trustScoreAddress, registryAddress, usdcAddress);
  await loanEscrow.waitForDeployment();
  const loanEscrowAddress = await loanEscrow.getAddress();
  console.log("   LoanEscrow deployed:", loanEscrowAddress);

  // 4. Authorize LoanEscrow to write trust scores
  console.log("\n4. Authorizing LoanEscrow on TrustScore...");
  const TrustScoreContract = await ethers.getContractAt("TrustScore", trustScoreAddress);
  const authTx = await TrustScoreContract.authorize(loanEscrowAddress);
  await authTx.wait();
  console.log("   LoanEscrow authorized to write trust scores.");
  console.log("\n5. Setup complete. Contracts deployed.");

  const addresses = {
    network: network.name,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    AgentRegistry: registryAddress,
    TrustScore: trustScoreAddress,
    LoanEscrow: loanEscrowAddress,
    USDC: usdcAddress,
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "..", "deployments.json");
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));
  console.log("\nDeployment addresses saved to:", outPath);
  console.log(JSON.stringify(addresses, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
