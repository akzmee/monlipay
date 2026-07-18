/**
 * Pure handler functions for the MonliPay indexer.
 *
 * These are deliberately separated from src/index.ts (which does the I/O
 * against Ponder's `db`) so they can be unit tested without spinning up
 * the Ponder runtime. Each function takes the event args + block metadata
 * and returns the row object that should be inserted/updated.
 *
 * Convention:
 *   - All addresses are normalized to LOWERCASE before storage. Ponder v0.12+
 *     already lowercases event args, but we do it again defensively so that
 *     older Ponder versions and direct calls to these functions still work.
 *     The on-chain RPC format is checksummed, which causes subtle bugs when
 *     comparing addresses in SQL WHERE clauses.
 *   - All bigint values are passed through unchanged (Ponder's t.bigint()
 *     column type accepts and returns native bigint).
 */

// ---------------------------------------------------------------------------
// Event arg types (extracted from the ABI — defined here so tests don't need
// to import the ABI).
// ---------------------------------------------------------------------------

export interface LinkCreatedEvent {
  depositId: bigint;
  sender: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  claimKey: `0x${string}`;
  expiry: bigint;
}

export interface LinkClaimedEvent {
  depositId: bigint;
  recipient: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
}

export interface LinkRefundedEvent {
  depositId: bigint;
  sender: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
}

export interface RefundFailedEvent {
  depositId: bigint;
  sender: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
}

// ---------------------------------------------------------------------------
// Block metadata (passed by the handler wrapper).
// ---------------------------------------------------------------------------

export interface BlockMeta {
  blockNumber: number;
  timestamp: number;
  chainId: number;
}

// ---------------------------------------------------------------------------
// Row type produced by applyLinkCreated. Matches the `links` table.
// ---------------------------------------------------------------------------

export interface LinkRow {
  depositId: bigint;
  sender: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  expiry: bigint;
  status: "active" | "claimed" | "refunded" | "refund_failed";
  recipient?: `0x${string}`;
  createdAtBlock: number;
  createdAtTs: number;
  closedAtBlock?: number;
  closedAtTs?: number;
  chainId: number;
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

function lower(addr: `0x${string}`): `0x${string}` {
  return addr.toLowerCase() as `0x${string}`;
}

/**
 * Build the row to INSERT when a LinkCreated event fires.
 *
 * Pure: given the same inputs, always returns the same output. Safe to
 * call multiple times (idempotent at the row level — the INSERT in
 * src/index.ts uses onConflictDoNothing).
 */
export function applyLinkCreated(args: LinkCreatedEvent, meta: BlockMeta): LinkRow {
  return {
    depositId: args.depositId,
    sender: lower(args.sender),
    token: lower(args.token),
    amount: args.amount,
    expiry: args.expiry,
    status: "active",
    createdAtBlock: meta.blockNumber,
    createdAtTs: meta.timestamp,
    chainId: meta.chainId,
  };
}

/**
 * Build the partial row to UPDATE when a LinkClaimed event fires.
 *
 * Only links with status === "active" should be updated (the WHERE clause
 * in src/index.ts enforces this). A link that's already "refunded" cannot
 * be claimed — the contract prevents it.
 */
export function applyLinkClaimed(
  args: LinkClaimedEvent,
  meta: { blockNumber: number; timestamp: number },
) {
  return {
    status: "claimed" as const,
    recipient: lower(args.recipient),
    closedAtBlock: meta.blockNumber,
    closedAtTs: meta.timestamp,
  };
}

/**
 * Build the partial row to UPDATE when a LinkRefunded event fires.
 *
 * Both manual `refund()` and permissionless `autoRefund()` emit this event,
 * so we don't need to distinguish them. `claimFailedRefund()` also emits
 * LinkRefunded — and in that case the deposit was previously in
 * `refund_failed` state. The handler in src/index.ts allows the transition
 * `active` → `refunded` AND `refund_failed` → `refunded` so that the link
 * reflects the terminal state correctly after a failed-then-recovered
 * refund.
 */
export function applyLinkRefunded(
  args: LinkRefundedEvent,
  meta: { blockNumber: number; timestamp: number },
) {
  void args; // args.sender/token/amount are not stored on the link row
  return {
    status: "refunded" as const,
    closedAtBlock: meta.blockNumber,
    closedAtTs: meta.timestamp,
  };
}

/**
 * Statuses from which a link can transition to "refunded" via the
 * LinkRefunded event. Used by src/index.ts to build the WHERE clause.
 *
 *   "active"         — normal refund / autoRefund path
 *   "refund_failed"  — claimFailedRefund recovery path (funds were parked
 *                      in failedRefunds[depositId], now pulled out)
 *
 * NOT included: "claimed" (the contract prevents refunds on already-claimed
 * deposits, but we're defensive) and "refunded" (terminal, no-op).
 */
export const REFUNDABLE_STATUSES = ["active", "refund_failed"] as const;

/**
 * Build the partial row to UPDATE when a RefundFailed event fires.
 *
 * This means a refund was attempted but the push-transfer to the sender
 * reverted (e.g. sender is a contract that rejects ETH). Funds are parked
 * in `failedRefunds[depositId]` on-chain and recoverable via
 * `claimFailedRefund(depositId, recipient)` — the UI surfaces a hint
 * pointing the user to that.
 */
export function applyRefundFailed(
  args: RefundFailedEvent,
  meta: { blockNumber: number; timestamp: number },
) {
  void args;
  return {
    status: "refund_failed" as const,
    closedAtBlock: meta.blockNumber,
    closedAtTs: meta.timestamp,
  };
}
