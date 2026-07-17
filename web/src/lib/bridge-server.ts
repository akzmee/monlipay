/**
 * Server-side bridge configuration.
 *
 * This module reads API keys from environment variables and provides
 * a safe accessor for server-side API routes. These keys are NEVER
 * exposed to the client — only the /api/bridge/* routes import this file.
 *
 * Required env vars (in web/.env.local, WITHOUT NEXT_PUBLIC_ prefix):
 *   LIFI_API_KEY     — Get one at https://li.fi (free tier available)
 *   ALCHEMY_API_KEY  — Get one at https://alchemy.com (free tier available)
 *
 * If keys are not set, the API routes return helpful error messages
 * instead of crashing. This allows the app to build/deploy without
 * keys, and activate when keys are provided.
 *
 * SECURITY: This module must never be imported from client code.
 * Next.js API routes (app/api/*) are the only legitimate consumers.
 * The bundler prevents client imports automatically since this file
 * has no "use client" directive and is only imported from route handlers.
 */

/**
 * Known placeholder values that indicate the user has not set a real key.
 * Rejecting these prevents accidental deployments with dummy values
 * (e.g. copying .env.example to .env.local without editing).
 */
const PLACEHOLDER_VALUES = new Set([
  "",
  "your-lifi-api-key",
  "your-alchemy-api-key",
  "your_key_here",
  "your-key-here",
  "xxx",
  "changeme",
  "placeholder",
  "todo",
]);

/**
 * Validate that a key is non-empty and not a known placeholder.
 * Does NOT attempt to verify the key is actually valid with the remote
 * service — that is deferred to the first API call.
 */
function isValidApiKey(key: string | undefined): key is string {
  if (typeof key !== "string") return false;
  const trimmed = key.trim().toLowerCase();
  if (PLACEHOLDER_VALUES.has(trimmed)) return false;
  // Real API keys are at least 8 chars and contain no spaces
  if (trimmed.length < 8) return false;
  if (/\s/.test(trimmed)) return false;
  return true;
}

/**
 * LI.FI API key. Read from server-only env var.
 * NEVER use NEXT_PUBLIC_ for this — it would expose the key in the browser.
 */
export const LIFI_API_KEY = isValidApiKey(process.env.LIFI_API_KEY)
  ? process.env.LIFI_API_KEY.trim()
  : "";

/**
 * Alchemy API key for multi-chain balance scanning.
 * NEVER use NEXT_PUBLIC_ for this.
 */
export const ALCHEMY_API_KEY = isValidApiKey(process.env.ALCHEMY_API_KEY)
  ? process.env.ALCHEMY_API_KEY.trim()
  : "";

/**
 * LI.FI API base URL. Can be overridden for testing.
 */
export const LIFI_BASE_URL = "https://li.quest/v1";

/** Check if LI.FI is configured with a valid-looking key. */
export const isLifiConfigured = LIFI_API_KEY.length > 0;

/** Check if Alchemy is configured with a valid-looking key. */
export const isAlchemyConfigured = ALCHEMY_API_KEY.length > 0;

// Exported for unit testing — not used at runtime by consumers.
export { isValidApiKey as _isValidApiKey };

/**
 * Source chains supported for bridging to Monad.
 * These are the most popular chains with high liquidity.
 */
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

/**
 * Build Alchemy RPC URL for a given chain ID.
 * Falls back to public RPC if Alchemy key is not configured.
 */
export function getAlchemyRpcUrl(chainId: number): string {
  const chainKey = ALCHEMY_CHAIN_KEYS[chainId];
  if (isAlchemyConfigured && chainKey) {
    return `https://${chainKey}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`;
  }
  // Fallback to public RPCs (less reliable, rate-limited)
  return PUBLIC_RPCS[chainId] || "";
}

/** Alchemy chain key mapping for URL construction. */
const ALCHEMY_CHAIN_KEYS: Record<number, string> = {
  1: "eth-mainnet",
  10: "opt-mainnet",
  8453: "base-mainnet",
  42161: "arb-mainnet",
  137: "polygon-mainnet",
  56: "bnb-mainnet",
  43114: "avax-mainnet",
};

/** Public RPC fallbacks (rate-limited, no API key needed). */
const PUBLIC_RPCS: Record<number, string> = {
  1: "https://eth.llamarpc.com",
  10: "https://mainnet.optimism.io",
  8453: "https://mainnet.base.org",
  42161: "https://arb1.arbitrum.io/rpc",
  137: "https://polygon-rpc.com",
  56: "https://bsc-dataseed.binance.org",
  43114: "https://api.avax.network/ext/bc/C/rpc",
};
