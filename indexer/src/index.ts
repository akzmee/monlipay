import { createIndexer } from "ponder:indexer";
import { ponderSchema } from "ponder:schema";
import { inArray } from "ponder:drizzle";

import { links, events } from "../ponder.schema";
import {
  type LinkCreatedEvent,
  type LinkClaimedEvent,
  type LinkRefundedEvent,
  type RefundFailedEvent,
  applyLinkCreated,
  applyLinkClaimed,
  applyLinkRefunded,
  applyRefundFailed,
  REFUNDABLE_STATUSES,
} from "./handlers";

/**
 * Main Ponder indexer entry point.
 *
 * The 4 event handlers below mirror the logic previously implemented in
 * the frontend's localStorage-backed `useMyLinks` flow, except now state
 * lives in a Postgres/SQLite table that is shared across all clients and
 * survives wallet switches.
 *
 * Each handler is split into two parts:
 *   1. A pure function (`apply*`) that takes inputs and returns the row
 *      to insert/update. This makes it unit-testable without spinning up
 *      Ponder. See src/handlers.ts + __tests__.
 *   2. A thin wrapper that reads `event.args`, calls the pure function,
 *      and applies the result to `db`.
 *
 * State machine for `links.status`:
 *
 *     ┌──────────────────────────────────────────────────────────┐
 *     │                                                          ▼
 *   active ──LinkClaimed──▶ claimed                        refund_failed
 *     │                                                       │
 *     ├──LinkRefunded──▶ refunded                             │
 *     │                          ▲                            │
 *     └──RefundFailed──▶ refund_failed ──LinkRefunded─────────┘
 *                              (via claimFailedRefund)
 *
 * The LinkRefunded handler accepts transitions from BOTH `active` and
 * `refund_failed` (see REFUNDABLE_STATUSES) so the recovery path works.
 */
export default createIndexer(async (db) => {
  // ---------------------------------------------------------------------
  // LinkCreated
  // ---------------------------------------------------------------------
  db.indexer.on("LinkVault:LinkCreated", async ({ event, chain }) => {
    const args = event.args as LinkCreatedEvent;
    const blockNumber = Number(event.block.number);
    const timestamp = Number(event.block.timestamp);
    const row = applyLinkCreated(args, {
      blockNumber,
      timestamp,
      chainId: chain.id,
    });
    const txHash = event.transaction.hash.toLowerCase() as `0x${string}`;

    await db.insert(links).values(row).onConflictDoNothing();
    await db
      .insert(events)
      .values({
        depositId: row.depositId,
        eventName: "LinkCreated",
        sender: row.sender,
        token: row.token,
        amount: row.amount,
        blockNumber,
        timestamp,
        chainId: chain.id,
        txHash,
      })
      .onConflictDoNothing();
  });

  // ---------------------------------------------------------------------
  // LinkClaimed
  // ---------------------------------------------------------------------
  db.indexer.on("LinkVault:LinkClaimed", async ({ event, chain }) => {
    const args = event.args as LinkClaimedEvent;
    const blockNumber = Number(event.block.number);
    const timestamp = Number(event.block.timestamp);
    const update = applyLinkClaimed(args, {
      blockNumber,
      timestamp,
    });
    const txHash = event.transaction.hash.toLowerCase() as `0x${string}`;

    // Only update if the link is still active — protects against an
    // extremely unlikely scenario where a RefundFailed fires after a
    // successful claim (the contract prevents this, but we're defensive).
    await db
      .update(links, { depositId: args.depositId })
      .set(update)
      .where({ status: "active" });

    await db
      .insert(events)
      .values({
        depositId: args.depositId,
        eventName: "LinkClaimed",
        recipient: args.recipient.toLowerCase() as `0x${string}`,
        token: args.token.toLowerCase() as `0x${string}`,
        amount: args.amount,
        blockNumber,
        timestamp,
        chainId: chain.id,
        txHash,
      })
      .onConflictDoNothing();
  });

  // ---------------------------------------------------------------------
  // LinkRefunded (fires for refund(), autoRefund(), AND claimFailedRefund())
  // ---------------------------------------------------------------------
  db.indexer.on("LinkVault:LinkRefunded", async ({ event, chain }) => {
    const args = event.args as LinkRefundedEvent;
    const blockNumber = Number(event.block.number);
    const timestamp = Number(event.block.timestamp);
    const update = applyLinkRefunded(args, {
      blockNumber,
      timestamp,
    });
    const txHash = event.transaction.hash.toLowerCase() as `0x${string}`;

    // Allow the transition from BOTH `active` (normal refund) AND
    // `refund_failed` (recovery via claimFailedRefund). See state machine
    // in the file header.
    await db
      .update(links, { depositId: args.depositId })
      .set(update)
      .where(inArray(links.status, [...REFUNDABLE_STATUSES]));

    await db
      .insert(events)
      .values({
        depositId: args.depositId,
        eventName: "LinkRefunded",
        sender: args.sender.toLowerCase() as `0x${string}`,
        token: args.token.toLowerCase() as `0x${string}`,
        amount: args.amount,
        blockNumber,
        timestamp,
        chainId: chain.id,
        txHash,
      })
      .onConflictDoNothing();
  });

  // ---------------------------------------------------------------------
  // RefundFailed (push-transfer reverted; funds parked, recoverable)
  // ---------------------------------------------------------------------
  db.indexer.on("LinkVault:RefundFailed", async ({ event, chain }) => {
    const args = event.args as RefundFailedEvent;
    const blockNumber = Number(event.block.number);
    const timestamp = Number(event.block.timestamp);
    const update = applyRefundFailed(args, {
      blockNumber,
      timestamp,
    });
    const txHash = event.transaction.hash.toLowerCase() as `0x${string}`;

    // Mark as refund_failed so the UI can hint the user to call
    // claimFailedRefund() from a different EOA. The link's status moves
    // from "active" → "refund_failed" (NOT "refunded") so it doesn't
    // disappear from the My Links page.
    await db
      .update(links, { depositId: args.depositId })
      .set(update)
      .where({ status: "active" });

    await db
      .insert(events)
      .values({
        depositId: args.depositId,
        eventName: "RefundFailed",
        sender: args.sender.toLowerCase() as `0x${string}`,
        token: args.token.toLowerCase() as `0x${string}`,
        amount: args.amount,
        blockNumber,
        timestamp,
        chainId: chain.id,
        txHash,
      })
      .onConflictDoNothing();
  });
});

// Use ponderSchema so the import isn't tree-shaken away — some Ponder
// versions require it for the codegen step to pick up the schema.
void ponderSchema;
