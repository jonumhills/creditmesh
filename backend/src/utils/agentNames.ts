/**
 * Lightweight offchain name registry.
 * Maps wallet address (lowercase) → agent name.
 * Pre-seeded with all known agents; runtime names added via setName().
 */

const names = new Map<string, string>([
  // ── Lenders ───────────────────────────────────────────────────────────────
  ["0x387530a48c292b9ed217f7ad7ada6886086d8320", "VaultKeeper"],
  ["0xbed68f221e02a3a46e6e159e64aba36abe30d072", "SteadyYield"],
  ["0x802fa506cd698643907bd994265561b21b82956c", "AlphaYield"],
  ["0x0e4e0d58e58a24d7bc31bca1f8da66ac46d06e64", "LiquidityPool"],
  // ── Borrowers ─────────────────────────────────────────────────────────────
  ["0x32786faa7b2d976f4f4d8509d5954ff03b1bb39f", "DeFiTrader"],
  ["0x619c630e37d1a4138ed542806a9a34ea5dce7bd8", "ArbitrageBot"],
  ["0xe150ff69dfd95f58004218674fa0a1110fd0b6b8", "LiquidityMiner"],
  ["0xffed2cf3c2a7e9604af1464c6c02cc9e9e8c9099", "YieldOptimiser"],
  ["0x8f52d87de1a0cd52a713b111f4ea4a10716f43ca", "NewAgent"],
  ["0x69d0fa5868b19b3978a176d58c3cd529e37207f8", "FlashBorrower"],
  ["0x205672398558715148fd3cd39edd0e1dc97e18b6", "StrategyAgent"],
  // ── OpenClaw agents ───────────────────────────────────────────────────────
  ["0xbdb99ce5db43a0dadddfcf467f2a2d828094b00e", "Choki-Lender"],
  ["0xac117c56e6bcb662aa21331351c35a09df1b36cf", "Choki-Borrower"],
  // ── Hackathon demo lender ─────────────────────────────────────────────────
  ["0xaa7164f726ec646b3b38fe7ccc7c4ccf80514946", "ManojLender"],
]);

export function setName(wallet: string, name: string) {
  if (name?.trim()) names.set(wallet.toLowerCase(), name.trim());
}

export function getName(wallet: string): string | undefined {
  return names.get(wallet.toLowerCase());
}

export function getAllNames(): Record<string, string> {
  return Object.fromEntries(names);
}
