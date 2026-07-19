import { ponder } from "ponder:registry";
import { links, events } from "ponder:schema";

/**
 * MonliPay LinkVault indexer — Ponder 0.17 API.
 *
 * State machine for links.status:
 *   active → claimed (LinkClaimed)
 *   active → refunded (LinkRefunded)
 *   active → refund_failed (RefundFailed) → refunded (LinkRefunded via claimFailedRefund)
 */

let eventId = 0n;

function nextEventId(): bigint {
  eventId += 1n;
  return eventId;
}

// LinkCreated — new payment link deposited
ponder.on("LinkVault:LinkCreated", async ({ event, context }) => {
  const args = event.args as {
    depositId: bigint;
    sender: `0x${string}`;
    token: `0x${string}`;
    amount: bigint;
    claimKey: `0x${string}`;
    expiry: bigint;
  };
  const blockNumber = Number(event.block.number);
  const timestamp = Number(event.block.timestamp);
  const chainId = context.chain.id;
  const txHash = event.transaction.hash.toLowerCase() as `0x${string}`;

  await context.db.insert(links).values({
    depositId: args.depositId,
    sender: args.sender.toLowerCase() as `0x${string}`,
    token: args.token.toLowerCase() as `0x${string}`,
    amount: args.amount,
    expiry: args.expiry,
    status: "active",
    createdAtBlock: blockNumber,
    createdAtTs: timestamp,
    chainId,
  }).onConflictDoNothing();

  await context.db.insert(events).values({
    id: nextEventId(),
    depositId: args.depositId,
    eventName: "LinkCreated",
    sender: args.sender.toLowerCase() as `0x${string}`,
    token: args.token.toLowerCase() as `0x${string}`,
    amount: args.amount,
    blockNumber,
    timestamp,
    chainId,
    txHash,
  }).onConflictDoNothing();
});

// LinkClaimed — recipient claimed funds
ponder.on("LinkVault:LinkClaimed", async ({ event, context }) => {
  const args = event.args as {
    depositId: bigint;
    recipient: `0x${string}`;
    token: `0x${string}`;
    amount: bigint;
  };
  const blockNumber = Number(event.block.number);
  const timestamp = Number(event.block.timestamp);
  const chainId = context.chain.id;
  const txHash = event.transaction.hash.toLowerCase() as `0x${string}`;

  const existing = await context.db.find(links, { depositId: args.depositId });
  if (existing && existing.status === "active") {
    await context.db.update(links, { depositId: args.depositId }).set({
      status: "claimed",
      recipient: args.recipient.toLowerCase() as `0x${string}`,
      closedAtBlock: blockNumber,
      closedAtTs: timestamp,
    });
  }

  await context.db.insert(events).values({
    id: nextEventId(),
    depositId: args.depositId,
    eventName: "LinkClaimed",
    recipient: args.recipient.toLowerCase() as `0x${string}`,
    token: args.token.toLowerCase() as `0x${string}`,
    amount: args.amount,
    blockNumber,
    timestamp,
    chainId,
    txHash,
  }).onConflictDoNothing();
});

// LinkRefunded — sender/keeper refunded (fires for refund, autoRefund, AND claimFailedRefund)
ponder.on("LinkVault:LinkRefunded", async ({ event, context }) => {
  const args = event.args as {
    depositId: bigint;
    sender: `0x${string}`;
    token: `0x${string}`;
    amount: bigint;
  };
  const blockNumber = Number(event.block.number);
  const timestamp = Number(event.block.timestamp);
  const chainId = context.chain.id;
  const txHash = event.transaction.hash.toLowerCase() as `0x${string}`;

  const existing = await context.db.find(links, { depositId: args.depositId });
  if (existing && (existing.status === "active" || existing.status === "refund_failed")) {
    await context.db.update(links, { depositId: args.depositId }).set({
      status: "refunded",
      closedAtBlock: blockNumber,
      closedAtTs: timestamp,
    });
  }

  await context.db.insert(events).values({
    id: nextEventId(),
    depositId: args.depositId,
    eventName: "LinkRefunded",
    sender: args.sender.toLowerCase() as `0x${string}`,
    token: args.token.toLowerCase() as `0x${string}`,
    amount: args.amount,
    blockNumber,
    timestamp,
    chainId,
    txHash,
  }).onConflictDoNothing();
});

// RefundFailed — push-transfer reverted; funds parked, recoverable
ponder.on("LinkVault:RefundFailed", async ({ event, context }) => {
  const args = event.args as {
    depositId: bigint;
    sender: `0x${string}`;
    token: `0x${string}`;
    amount: bigint;
  };
  const blockNumber = Number(event.block.number);
  const timestamp = Number(event.block.timestamp);
  const chainId = context.chain.id;
  const txHash = event.transaction.hash.toLowerCase() as `0x${string}`;

  const existing = await context.db.find(links, { depositId: args.depositId });
  if (existing && existing.status === "active") {
    await context.db.update(links, { depositId: args.depositId }).set({
      status: "refund_failed",
      closedAtBlock: blockNumber,
      closedAtTs: timestamp,
    });
  }

  await context.db.insert(events).values({
    id: nextEventId(),
    depositId: args.depositId,
    eventName: "RefundFailed",
    sender: args.sender.toLowerCase() as `0x${string}`,
    token: args.token.toLowerCase() as `0x${string}`,
    amount: args.amount,
    blockNumber,
    timestamp,
    chainId,
    txHash,
  }).onConflictDoNothing();
});
