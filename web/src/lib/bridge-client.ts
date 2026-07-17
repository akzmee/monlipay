/**
 * Client-side bridge constants.
 *
 * These are safe to expose to the browser (no API keys).
 * For server-only config, see bridge-server.ts.
 */

/** Source chains supported for bridging TO Monad. */
export const SOURCE_CHAINS = [
  { id: 1, name: "Ethereum", shortName: "eth" },
  { id: 10, name: "Optimism", shortName: "op" },
  { id: 8453, name: "Base", shortName: "base" },
  { id: 42161, name: "Arbitrum One", shortName: "arb" },
  { id: 137, name: "Polygon", shortName: "polygon" },
  { id: 56, name: "BNB Chain", shortName: "bnb" },
  { id: 43114, name: "Avalanche", shortName: "avax" },
] as const;

/**
 * Monad destination chain — depends on NEXT_PUBLIC_NETWORK env var.
 * In testnet mode, destination is Monad Testnet (10143).
 * In mainnet mode, destination is Monad Mainnet (143).
 */
export const MONAD_DESTINATION_CHAIN_ID =
  process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? 143 : 10143;
