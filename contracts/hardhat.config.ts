import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config({ path: "../.env" });

const rawKey = process.env.DEPLOYER_PRIVATE_KEY || "";
const DEPLOYER_PRIVATE_KEY =
  rawKey.startsWith("0x") && rawKey.length === 66 ? rawKey : "0x" + "0".repeat(64);
const hasKey = rawKey.startsWith("0x") && rawKey.length === 66;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    ...(hasKey && {
      arcTestnet: {
        url: process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network",
        chainId: Number(process.env.ARC_TESTNET_CHAIN_ID || "5042002"),
        accounts: [DEPLOYER_PRIVATE_KEY],
      },
    }),
  },
  etherscan: {
    apiKey: {
      arcTestnet: process.env.ARC_EXPLORER_API_KEY || "",
    },
    customChains: [
      {
        network: "arcTestnet",
        chainId: Number(process.env.ARC_TESTNET_CHAIN_ID || "5042002"),
        urls: {
          apiURL:     "https://testnet.arcscan.app/api",
          browserURL: "https://testnet.arcscan.app",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
