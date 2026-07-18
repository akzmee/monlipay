/**
 * Gas sponsorship configuration (EIP-2771 meta-transactions).
 *
 * This module controls whether the app pays gas on behalf of users for
 * specific actions (currently: claim). It reads from environment vars so
 * the feature can be toggled per-deployment without code changes.
 *
 *  NEXT_PUBLIC_GAS_SPONSOR_ENABLED  — "true" | "false" (default: "false")
 *                                     Client-visible. When false, the UI
 *                                     always falls back to direct
 *                                     wallet-paid transactions.
 *
 *  NEXT_PUBLIC_GAS_FORWARDER_ADDRESS — 0x... (required when sponsor is on)
 *                                      The ERC2771Forwarder contract that
 *                                      the LinkVault V2 trusts.
 *
 *  GAS_SPONSOR_PRIVATE_KEY          — server-only. The sponsor wallet's
 *                                      key. Used by /api/sponsor/claim to
 *                                      broadcast relayed txs. NEVER expose
 *                                      to the client (no NEXT_PUBLIC_).
 *
 *  GAS_SPONSOR_DAILY_BUDGET_MON     — server-only. Max MON the sponsor
 *                                      will spend per UTC day. Default
 *                                      "0.5". When exhausted, the API
 *                                      returns 503 and the UI falls back
 *                                      to direct claim.
 *
 * SECURITY NOTES
 *   - The sponsor key only lives on the server. The client never sees it.
 *   - The forwarder address is public — it's in the contract bytecode.
 *   - When sponsorship is disabled (or budget exhausted), the app MUST
 *     gracefully fall back to direct user-paid transactions. The contract
 *     supports both modes simultaneously.
 */

import { isAddress, type Address } from "viem";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Whether gas sponsorship is enabled in this deployment.
 * Exposed to the client via NEXT_PUBLIC_.
 */
export const GAS_SPONSOR_ENABLED =
  process.env.NEXT_PUBLIC_GAS_SPONSOR_ENABLED === "true";

/**
 * The ERC2771Forwarder contract address that the deployed LinkVault V2
 * trusts. Required when sponsorship is enabled.
 */
const RAW_FORWARDER_ADDRESS =
  process.env.NEXT_PUBLIC_GAS_FORWARDER_ADDRESS ?? ZERO_ADDRESS;

if (
  GAS_SPONSOR_ENABLED &&
  RAW_FORWARDER_ADDRESS !== ZERO_ADDRESS &&
  !isAddress(RAW_FORWARDER_ADDRESS)
) {
  console.error(
    `[gas-sponsor] NEXT_PUBLIC_GAS_FORWARDER_ADDRESS is not a valid address: ` +
      `"${RAW_FORWARDER_ADDRESS}". Sponsorship will be disabled.`,
  );
}

export const GAS_FORWARDER_ADDRESS = (
  isAddress(RAW_FORWARDER_ADDRESS)
    ? RAW_FORWARDER_ADDRESS
    : ZERO_ADDRESS
) as Address;

/**
 * Effective sponsorship availability — only true when enabled AND a valid
 * forwarder address is configured. Use this in client UI to decide whether
 * to offer the "Sponsored claim" path.
 */
export const isGasSponsorAvailable =
  GAS_SPONSOR_ENABLED && GAS_FORWARDER_ADDRESS !== ZERO_ADDRESS;

// ---------------------------------------------------------------------------
// Server-only config below. These are intentionally NOT exported with
// NEXT_PUBLIC_. Importing this file from client code is fine — the values
// are simply empty/zero on the client because the env vars aren't inlined.
// ---------------------------------------------------------------------------

/**
 * Sponsor wallet private key. Server-only. Empty string when not configured.
 * The sponsor wallet must be funded with MON on each chain where
 * sponsorship is enabled.
 */
export const GAS_SPONSOR_PRIVATE_KEY =
  process.env.GAS_SPONSOR_PRIVATE_KEY ?? "";

/**
 * Daily budget (in MON) that the sponsor is willing to spend. Parsed at
 * module load; defaults to 0.5 MON which is plenty for a hackathon demo
 * (~50,000 claims at ~0.00001 MON/claim).
 */
const RAW_DAILY_BUDGET = process.env.GAS_SPONSOR_DAILY_BUDGET_MON ?? "0.5";
const PARSED_BUDGET = Number(RAW_DAILY_BUDGET);
export const GAS_SPONSOR_DAILY_BUDGET_MON =
  Number.isFinite(PARSED_BUDGET) && PARSED_BUDGET > 0 ? PARSED_BUDGET : 0;

/**
 * Whether the server-side relay is fully configured (key + budget + enabled).
 * Used by the API route to decide whether to accept relay requests.
 */
export const isSponsorServerConfigured =
  GAS_SPONSOR_ENABLED &&
  GAS_FORWARDER_ADDRESS !== ZERO_ADDRESS &&
  GAS_SPONSOR_PRIVATE_KEY.length === 66 && // 0x + 64 hex
  GAS_SPONSOR_DAILY_BUDGET_MON > 0;

/**
 * Rate limits for the sponsor endpoint. Tighter than the default rate
 * limiter since each accepted request costs the sponsor real money.
 */
export const SPONSOR_RATE_LIMITS = {
  /** Max relay requests per IP per minute. */
  PER_IP_PER_MINUTE: 5,
  /** Max relay requests per recipient address per hour. */
  PER_RECIPIENT_PER_HOUR: 3,
  /** Max relay requests per deposit ID. A deposit can only be claimed once. */
  PER_DEPOSIT: 1,
} as const;
