/**
 * Helpers for parsing LI.FI API responses safely.
 *
 * LI.FI's response structure has several gotchas:
 *   1. gasCosts and feeCosts are ARRAYS of cost objects, not strings.
 *      Each item: { amount: string (native units), amountUSD: string, ... }
 *   2. Status strings are returned UPPERCASE ("DONE", "PENDING", "FAILED")
 *      but our internal type uses lowercase.
 *   3. Token decimals can vary widely (WBTC=8, USDC=6, MON=18, etc.)
 *
 * This module centralizes all LI.FI-specific parsing so that bugs in
 * interpretation are caught in one place and covered by unit tests.
 */

import type { BridgeStatus } from "@/lib/bridge-types";

/** A single cost entry from LI.FI's estimate.gasCosts / estimate.feeCosts. */
interface LifiCost {
  amount?: string;
  amountUSD?: string;
  token?: { symbol?: string; decimals?: number };
  type?: string;
}

/** Extract USD cost from a LI.FI costs array. */
export function extractCostUSD(
  costs: unknown,
  fallback = "0",
): string {
  if (!Array.isArray(costs) || costs.length === 0) {
    // Some LI.FI responses have a simple string instead of array.
    if (typeof costs === "string" && costs !== "") return costs;
    return fallback;
  }
  // Sum all USD amounts in the array
  let total = 0;
  let hasAny = false;
  for (const c of costs as LifiCost[]) {
    if (c && typeof c.amountUSD === "string") {
      const v = parseFloat(c.amountUSD);
      if (!Number.isNaN(v)) {
        total += v;
        hasAny = true;
      }
    }
  }
  return hasAny ? total.toFixed(6) : fallback;
}

/** Extract native-unit cost from a LI.FI costs array. */
export function extractCostAmount(
  costs: unknown,
  fallback = "0",
): string {
  if (!Array.isArray(costs) || costs.length === 0) {
    if (typeof costs === "string" && costs !== "") return costs;
    return fallback;
  }
  // Sum all native amounts (may be in different tokens, but LI.FI normalizes)
  let total = 0n;
  let hasAny = false;
  for (const c of costs as LifiCost[]) {
    if (c && typeof c.amount === "string") {
      try {
        total += BigInt(c.amount);
        hasAny = true;
      } catch {
        // ignore unparseable amounts
      }
    }
  }
  return hasAny ? total.toString() : fallback;
}

/**
 * Map LI.FI status strings to our BridgeStatus union.
 *
 * LI.FI returns UPPERCASE values: "PENDING", "DONE", "FAILED", "REFUNDED",
 * "NOT_FOUND", "WAITING_FOR_RECEIVING_TRANSACTION", etc.
 *
 * Our type uses lowercase: "pending", "done", "failed", "refunded".
 */
const STATUS_MAP: Record<string, BridgeStatus> = {
  // Terminal states
  done: "done",
  DONE: "done",
  completed: "done",
  COMPLETED: "done",
  failed: "failed",
  FAILED: "failed",
  refunded: "refunded",
  REFUNDED: "refunded",
  // Non-terminal
  pending: "pending",
  PENDING: "pending",
  waiting: "waiting",
  WAITING: "waiting",
  waiting_for_confirmation: "waiting",
  WAITING_FOR_CONFIRMATION: "waiting",
  waiting_for_receiving_transaction: "waiting",
  WAITING_FOR_RECEIVING_TRANSACTION: "waiting",
  not_started: "not_started",
  NOT_STARTED: "not_started",
  // Unknown
  not_found: "unknown",
  NOT_FOUND: "unknown",
  unknown: "unknown",
  UNKNOWN: "unknown",
  null: "unknown",
};

export function normalizeStatus(raw: unknown): BridgeStatus {
  if (typeof raw !== "string") return "unknown";
  return STATUS_MAP[raw] ?? "unknown";
}

/** Check if a status is terminal (no more polling needed). */
export function isTerminalStatus(status: BridgeStatus): boolean {
  return status === "done" || status === "failed" || status === "refunded";
}
