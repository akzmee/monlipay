import { onchainTable, index } from "ponder";

export const links = onchainTable(
  "links",
  (t) => ({
    depositId: t.bigint().primaryKey(),
    sender: t.hex().notNull(),
    token: t.hex().notNull(),
    amount: t.bigint().notNull(),
    expiry: t.bigint().notNull(),
    status: t.text().notNull().default("active"),
    recipient: t.hex(),
    createdAtBlock: t.integer().notNull(),
    createdAtTs: t.integer().notNull(),
    closedAtBlock: t.integer(),
    closedAtTs: t.integer(),
    chainId: t.integer().notNull(),
  }),
  (table) => ({
    senderIdx: index().on(table.sender),
    statusExpiryIdx: index().on(table.status, table.expiry),
  }),
);

export const events = onchainTable(
  "events",
  (t) => ({
    id: t.bigint().primaryKey(),
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
    depositEventIdx: index().on(table.depositId, table.eventName),
    senderIdx: index().on(table.sender),
  }),
);
