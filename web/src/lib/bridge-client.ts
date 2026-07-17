/**
 * Client-side bridge constants.
 *
 * These are safe to expose to the browser (no API keys).
 * For server-only config, see bridge-server.ts.
 */

/**
 * Source chains supported for bridging TO Monad.
 *
 * `logoURI` uses trustwallet/assets chain-level logos
 * (blockchains/<slug>/info/logo.png, 200 OK verified 2025-07-17).
 * Slugs differ from chain IDs and shortNames — see
 * https://github.com/trustwallet/assets/tree/master/blockchains.
 */
export const SOURCE_CHAINS = [
  { id: 1, name: "Ethereum", shortName: "eth", logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png" },
  { id: 10, name: "Optimism", shortName: "op", logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png" },
  { id: 8453, name: "Base", shortName: "base", logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png" },
  { id: 42161, name: "Arbitrum One", shortName: "arb", logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png" },
  { id: 137, name: "Polygon", shortName: "polygon", logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png" },
  { id: 56, name: "BNB Chain", shortName: "bnb", logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png" },
  { id: 43114, name: "Avalanche", shortName: "avax", logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchex/info/logo.png" },
] as const;

/**
 * Monad destination chain — depends on NEXT_PUBLIC_NETWORK env var.
 * In testnet mode, destination is Monad Testnet (10143).
 * In mainnet mode, destination is Monad Mainnet (143).
 */
export const MONAD_DESTINATION_CHAIN_ID =
  process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? 143 : 10143;
