import { onchainTable, index } from "ponder";

/**
 * Ponder schema for MonliPay LinkVault.
 *
 * Design:
 *   - `links` is the "current state" table — one row per depositId, updated
 *     in place as events arrive. This is what the My Links page queries.
 *   - `events` is an append-only log of every event, mostly for debugging /
 *     audit. Not currently exposed to the frontend but cheap to keep.
 *
 * The `links` table mirrors what the frontend previously stored in
 * localStorage (web/src/lib/storage.ts:StoredLink) — minus `shareableUrl`,
 * which CANNOT be reconstructed from on-chain data because the secret key
 * never leaves the browser. The frontend now warns the user at create-time
 * to save the link URL, and the My Links page no longer displays it.
 *
 * Refund works purely from `depositId` (the contract's `refund(depositId)`
 * doesn't need the secret key), so the My Links page can still refund
 * expired links even without the URL.
 */
export const links = onchainTable(
  "links",
  (t) => ({
    // Primary key — depositId is globally unique per chain.
    depositId: t.bigint().primaryKey(),

    // Original creator (msg.sender on LinkCreated).
    sender: t.hex().notNull(),

    // Token address (address(0) = native MON).
    token: t.hex().notNull(),

    // Amount in base units (wei).
    amount: t.bigint().notNull(),

    // Unix timestamp after which the sender can refund.
    expiry: t.bigint().notNull(),

    // Lifecycle state.
    //   "active"     — created, not yet claimed/refunded
    //   "claimed"    — recipient claimed via claim()
    //   "refunded"   — sender / keeper refunded via refund() or autoRefund()
    //   "refund_failed" — push-transfer to sender failed (sender is a
    //                  contract that rejects ETH). Funds are parked in
    //                  failedRefunds[depositId] and recoverable via
    //                  claimFailedRefund() — UI surfaces a hint.
    status: t.text().notNull().default("active"),

    // Recipient address — set when LinkClaimed fires.
    recipient: t.hex(),

    // Block numbers (useful for ordering / debugging).
    createdAtBlock: t.integer().notNull(),
    createdAtTs: t.integer().notNull(),
    closedAtBlock: t.integer(),
    closedAtTs: t.integer(),

    // Chain that emitted this event. Useful when indexing both networks
    // into a single store.
    chainId: t.integer().notNull(),
  }),
  (table) => ({
    // Primary lookup: "show me all links created by this wallet".
    // This is the main query the My Links page runs.
    senderIdx: index().on(table.sender),
    // Secondary lookup: "show me all expired-but-active links" (for the
    // auto-refund keeper to scan).
    statusExpiryIdx: index().on(table.status, table.expiry),
  }),
);

/**
 * Append-only event log.
 *
 * Each row = one on-chain event. The same depositId will have 1 row
 * for LinkCreated, plus 0..1 rows for LinkClaimed / LinkRefunded /
 * RefundFailed. Useful for the GraphQL API and for debugging.
 *
 * Primary key is a composite (depositId + eventName) since each event
 * type can fire at most once per deposit (claim/refund set claimed=true).
 */
export const events = onchainTable(
  "events",
  (t) => ({
    depositId: t.bigint().notNull(),
    eventName: t.text().notNull(),
    sender: t.hex(),
    recipient: t.hex(),
    token: t.hex().notNull(),
    amount: t.bigint().notNull(),
    blockNumber: t.integer().notNull(),
    timestamp: t.integer().notNull(),
    chainId: t.integer().notNull(),
    txHash: t.hex().notNull(),
  }),
  (table) => ({
    pk: index().on(table.depositId, table.eventName),
    senderIdx: index().on(table.sender),
  }),
);
