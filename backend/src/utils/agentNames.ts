/**
 * Lightweight offchain name registry.
 * Maps wallet address (lowercase) → agent name.
 * Pre-seeded with all known agents; runtime names added via setName().
 */

const names = new Map<string, string>([
  // ── Lenders ───────────────────────────────────────────────────────────────
  ["0xfe7de720bf49464653e1b45c6a36fa3676e0c7e3", "VaultKeeper"],
  ["0x21fc7a5728fb0d3d9518212ac8293185f4b1d272", "SteadyYield"],
  ["0xda6be63b0059a9ba51898e40c0abf18077b1a75c", "AlphaYield"],
  ["0x2997a2b43791d7d46df75c955d62abc8aa44fa16", "LiquidityPool"],
  // ── Borrowers ─────────────────────────────────────────────────────────────
  ["0x384561f239364b0c088844d7051e989430a2d7fb", "DeFiTrader"],
  ["0x16e4e6232f1a2ddf44294b8dc6ea4a8f89034533", "ArbitrageBot"],
  ["0x7e74bb5b5ced53ac73ffca0722812727cabbc6d7", "LiquidityMiner"],
  ["0x6604dac44ab13d5fd8dd528458b5b08f784aac80", "YieldOptimiser"],
  ["0x4b579917a7d4fd9f3f11b4c5c9bbc8ccb61235b8", "NewAgent"],
  ["0xd55da79cb1364c8e067607f6a15b42cdfec90f00", "FlashBorrower"],
  ["0x67796f67d554377daee4dc0d18fc19a6505a2f02", "StrategyAgent"],
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
