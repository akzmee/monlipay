/**
 * Input validation for bridge API routes.
 *
 * Every API route MUST validate its inputs using these schemas before
 * processing. This prevents injection attacks, invalid requests, and
 * provides clear error messages.
 *
 * SECURITY: All user-supplied input crossing a trust boundary (client → server)
 * must pass through these validators. Never use raw user input in fetch URLs,
 * database queries, or JSON-RPC payloads.
 */

/**
 * Maximum supported token amount in smallest units.
 * 2^256 - 1 is the EVM max, but we cap well below to avoid BigInt serialization
 * issues and to catch obvious mistakes (paste of wei instead of ether, etc.).
 * This is 10^36 — larger than WBTC supply (21M * 10^8 = 2.1 * 10^15).
 */
export const MAX_AMOUNT = "1000000000000000000000000000000000000"; // 10^36

/**
 * Validate an Ethereum address.
 * Must be 0x followed by 40 hex characters.
 * Checks checksum is not required — LI.FI and RPC handle that.
 */
export function isValidAddress(addr: string): addr is `0x${string}` {
  return typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

/**
 * Validate a chain ID. Must be a positive integer within a reasonable range.
 * The max (999999) is arbitrary but catches obvious garbage input.
 */
export function isValidChainId(id: unknown): id is number {
  return (
    typeof id === "number" &&
    Number.isInteger(id) &&
    id > 0 &&
    id < 1000000
  );
}

/**
 * Validate an amount string. Must be a positive integer string
 * (representing smallest token units, e.g. wei).
 *
 * Rejects:
 *   - Zero (no-op bridge)
 *   - Decimals (must be in smallest units — UI must convert before sending)
 *   - Scientific notation (ambiguous)
 *   - Negative numbers
 *   - Empty strings
 *   - Values exceeding MAX_AMOUNT (likely a bug — e.g. passed human units)
 */
export function isValidAmount(amount: string): boolean {
  if (typeof amount !== "string") return false;
  // Must be a non-negative integer string (no decimals, no scientific notation)
  if (!/^\d+$/.test(amount)) return false;
  if (amount === "0") return false;
  // Upper bound: reject absurdly large values that exceed EVM range
  try {
    if (BigInt(amount) > BigInt(MAX_AMOUNT)) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * Validate a transaction hash. Must be 0x followed by 64 hex chars.
 */
export function isValidTxHash(hash: string): boolean {
  return typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash);
}

/**
 * Validate a bridge/tool name. Used in the /status route `bridge` param.
 * Must be alphanumeric with optional dashes (e.g. "deBridge", "across-v2").
 * Prevents URL injection via the bridge parameter.
 */
export function isValidBridgeName(name: string): boolean {
  return typeof name === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(name);
}

/** Standard error responses for invalid input. */
export const ERRORS = {
  MISSING_API_KEY: {
    error:
      "LI.FI API key is not configured. Set LIFI_API_KEY in .env.local (without NEXT_PUBLIC_ prefix).",
    code: "MISSING_API_KEY",
  },
  MISSING_ALCHEMY_KEY: {
    error:
      "Alchemy API key is not configured. Set ALCHEMY_API_KEY in .env.local (without NEXT_PUBLIC_ prefix).",
    code: "MISSING_ALCHEMY_KEY",
  },
  INVALID_ADDRESS: {
    error:
      "Invalid address format. Expected 0x followed by 40 hex characters.",
    code: "INVALID_ADDRESS",
  },
  INVALID_CHAIN: {
    error: "Invalid chain ID. Must be a positive integer.",
    code: "INVALID_CHAIN_ID",
  },
  INVALID_AMOUNT: {
    error:
      "Invalid amount. Must be a positive integer string in smallest token units.",
    code: "INVALID_AMOUNT",
  },
  INVALID_TX_HASH: {
    error: "Invalid transaction hash format. Expected 0x + 64 hex chars.",
    code: "INVALID_TX_HASH",
  },
  INVALID_BRIDGE_NAME: {
    error:
      "Invalid bridge name. Must be alphanumeric (dashes/underscores allowed).",
    code: "INVALID_BRIDGE_NAME",
  },
  INVALID_DEST_CHAIN: {
    error:
      "Destination chain does not match the configured Monad chain. Set NEXT_PUBLIC_NETWORK to match.",
    code: "INVALID_DEST_CHAIN",
  },
  RATE_LIMITED: {
    error: "Too many requests. Please slow down.",
    code: "RATE_LIMITED",
  },
} as const;

/** Create a JSON error response with proper status code. */
export function errorResponse(
  error: { error: string; code: string },
  status = 400,
): Response {
  return new Response(JSON.stringify(error), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Create a JSON success response. */
export function successResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Prevent browsers from caching API responses by mistake
      "Cache-Control": "no-store",
    },
  });
}
