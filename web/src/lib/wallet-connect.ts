/**
 * WalletConnect project ID validation.
 *
 * Extracted from src/config/wagmi.ts so it can be unit-tested. The wagmi
 * config file is excluded from coverage because it imports browser-only
 * Next.js/wagmi code that doesn't run cleanly in vitest.
 *
 * SECURITY: WalletConnect v2 will not work without a real project ID.
 * Silently falling back to "dummy" makes debugging painful and may cause
 * connection attempts to leak metadata to whoever owns the placeholder
 * project (if any).
 *
 * Real WalletConnect project IDs are 32-char hex strings (UUIDs without dashes).
 */

/**
 * Known placeholder values that indicate the user has not set a real ID.
 * Rejecting these prevents accidental deployments with dummy values.
 */
export const KNOWN_PLACEHOLDER_IDS: ReadonlySet<string> = new Set([
  "",
  "dummy",
  "dummy-project-id",
  "placeholder",
  "your-project-id",
  "xxx",
  "changeme",
  "todo",
]);

/**
 * Validate that a WalletConnect project ID is non-empty, not a known
 * placeholder, and looks like a hex string of the expected length.
 *
 * Does NOT verify the ID is actually registered with WalletConnect Cloud
 * — that is deferred to the first connection attempt.
 */
export function isValidWalletConnectId(id: string): boolean {
  if (typeof id !== "string") return false;
  if (KNOWN_PLACEHOLDER_IDS.has(id.trim().toLowerCase())) return false;
  // WalletConnect project IDs are 32 hex chars (UUID without dashes).
  // Some legacy IDs may be different lengths; we accept 8-64 hex chars.
  return /^[0-9a-fA-F]{8,64}$/.test(id);
}
