import { ethers } from "ethers";
import { getProvider, getSigner } from "../utils/blockchain";

// ── ENS Contract Addresses (Ethereum Sepolia) ─────────────────────────────────
const ENS_REGISTRY    = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const PUBLIC_RESOLVER = "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD";
const NAME_WRAPPER    = "0x0635513f179D50A207757E05759CbD106d7dFbe";
const REVERSE_REGISTRAR = "0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6";

const REGISTRY_ABI = [
  "function owner(bytes32 node) external view returns (address)",
  "function resolver(bytes32 node) external view returns (address)",
];
const RESOLVER_ABI = [
  "function text(bytes32 node, string calldata key) external view returns (string memory)",
  "function setText(bytes32 node, string calldata key, string calldata value) external",
  "function addr(bytes32 node) external view returns (address)",
];
const NAME_WRAPPER_ABI = [
  "function setSubnodeRecord(bytes32 parentNode, string calldata label, address owner, address resolver, uint64 ttl, uint32 fuses, uint64 expiry) external returns (bytes32)",
  "function ownerOf(uint256 id) external view returns (address)",
];
const REVERSE_REGISTRAR_ABI = [
  "function node(address addr) external pure returns (bytes32)",
];

// CreditMesh text record keys
export const ENS_KEYS = {
  role:        "cm.role",
  trustScore:  "cm.trust_score",
  tier:        "cm.tier",
  kyaStatus:   "cm.kya_status",
  url:         "url",
  description: "description",
};

export interface AgentENSData {
  ensName:     string | null;
  subnodeName: string | null;
  textRecords: Record<string, string>;
  node:        string | null;
}

export class ENSService {
  private provider = getProvider();

  // ── Lookup ────────────────────────────────────────────────────────────────

  async reverseResolve(address: string): Promise<string | null> {
    try {
      const name = await this.provider.lookupAddress(address);
      return name;
    } catch {
      return null;
    }
  }

  async forwardResolve(name: string): Promise<string | null> {
    try {
      const addr = await this.provider.resolveName(name);
      return addr;
    } catch {
      return null;
    }
  }

  // ── Text Records ──────────────────────────────────────────────────────────

  async getTextRecord(nameOrAddress: string, key: string): Promise<string | null> {
    try {
      const name = nameOrAddress.startsWith("0x")
        ? await this.reverseResolve(nameOrAddress)
        : nameOrAddress;
      if (!name) return null;

      const node = ethers.namehash(name);
      const registry = new ethers.Contract(ENS_REGISTRY, REGISTRY_ABI, this.provider);
      const resolverAddr: string = await registry.resolver(node);
      if (!resolverAddr || resolverAddr === ethers.ZeroAddress) return null;

      const resolver = new ethers.Contract(resolverAddr, RESOLVER_ABI, this.provider);
      return await resolver.text(node, key);
    } catch {
      return null;
    }
  }

  async getAllTextRecords(nameOrAddress: string): Promise<Record<string, string>> {
    try {
      const name = nameOrAddress.startsWith("0x")
        ? await this.reverseResolve(nameOrAddress)
        : nameOrAddress;
      if (!name) return {};

      const node = ethers.namehash(name);
      const registry = new ethers.Contract(ENS_REGISTRY, REGISTRY_ABI, this.provider);
      const resolverAddr: string = await registry.resolver(node);
      if (!resolverAddr || resolverAddr === ethers.ZeroAddress) return {};

      const resolver = new ethers.Contract(resolverAddr, RESOLVER_ABI, this.provider);
      const records: Record<string, string> = {};
      for (const [k, key] of Object.entries(ENS_KEYS)) {
        try {
          const val = await resolver.text(node, key);
          if (val) records[k] = val;
        } catch { /* skip */ }
      }
      return records;
    } catch {
      return {};
    }
  }

  // Write CreditMesh agent text records to the Public Resolver.
  // Only works if the deployer wallet controls the ENS name.
  async setAgentTextRecords(
    ensName: string,
    data: { role: string; trustScore: number; tier: string; kyaStatus: string; wallet: string }
  ): Promise<string | null> {
    try {
      const signer = getSigner();
      const node = ethers.namehash(ensName);
      const resolver = new ethers.Contract(PUBLIC_RESOLVER, RESOLVER_ABI, signer);

      const backendUrl = process.env.BACKEND_URL || "https://creditmeshbackend-production.up.railway.app";

      // Batch all setText calls
      const entries = [
        [ENS_KEYS.role,        data.role],
        [ENS_KEYS.trustScore,  String(data.trustScore)],
        [ENS_KEYS.tier,        data.tier],
        [ENS_KEYS.kyaStatus,   data.kyaStatus],
        [ENS_KEYS.url,         `${backendUrl}/api/agents/${data.wallet}`],
        [ENS_KEYS.description, `CreditMesh ${data.role} · Score ${data.trustScore} · Ethereum Sepolia`],
      ];

      let lastTx: any = null;
      for (const [key, value] of entries) {
        const tx = await resolver.setText(node, key, value);
        lastTx = tx;
      }
      if (lastTx) await lastTx.wait();
      return lastTx?.hash ?? null;
    } catch (err: any) {
      console.warn("[ENS] setText failed:", err.message);
      return null;
    }
  }

  // ── Subnames ──────────────────────────────────────────────────────────────

  // Create `label.creditmesh.eth` subname owned by `toAddress`.
  // Requires the deployer to own creditmesh.eth via the NameWrapper.
  async createSubname(label: string, toAddress: string): Promise<string | null> {
    try {
      const signer   = getSigner();
      const wrapper  = new ethers.Contract(NAME_WRAPPER, NAME_WRAPPER_ABI, signer);
      const parentNode = ethers.namehash("creditmesh.eth");
      const expiry     = BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600); // 1 year

      const tx = await wrapper.setSubnodeRecord(
        parentNode,
        label,
        toAddress,
        PUBLIC_RESOLVER,
        0n,   // ttl
        0,    // fuses
        expiry
      );
      await tx.wait();
      return `${label}.creditmesh.eth`;
    } catch (err: any) {
      console.warn("[ENS] createSubname failed:", err.message);
      return null;
    }
  }

  // ── Full Profile ──────────────────────────────────────────────────────────

  async getAgentENS(wallet: string): Promise<AgentENSData> {
    const ensName    = await this.reverseResolve(wallet);
    const shortLabel = wallet.slice(2, 10).toLowerCase();
    const subnodeName = `${shortLabel}.creditmesh.eth`;
    const textRecords = ensName ? await this.getAllTextRecords(ensName) : {};
    const node        = ensName ? ethers.namehash(ensName) : null;

    return {
      ensName,
      subnodeName,
      textRecords,
      node,
    };
  }
}

export const ensService = new ENSService();
