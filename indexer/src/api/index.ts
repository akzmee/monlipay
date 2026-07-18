import { Hono } from "hono";
import { graphql } from "ponder:api";
import { db } from "ponder:db";
import { and, eq, lt, desc, sql } from "ponder:drizzle";
import { links } from "../../ponder.schema";

/**
 * MonliPay indexer HTTP API.
 *
 * Exposed endpoints:
 *   GET  /graphql             — Ponder's auto-generated GraphQL endpoint
 *                                (useful for ad-hoc queries / GraphiQL)
 *   GET  /healthz             — liveness probe
 *   GET  /v1/links/:address   — list links created by `address`
 *                                (the primary query for the My Links page)
 *   GET  /v1/links/:address/expired
 *                              — list ACTIVE links past their expiry
 *                                (used by the auto-refund keeper)
 *   GET  /v1/stats/:address   — aggregate counts (active/claimed/refunded)
 *
 * Conventions:
 *   - All addresses in URLs are CASE-INSENSITIVE. We lowercase them
 *     before querying because addresses are stored lowercase.
 *   - All JSON responses are indexed by depositId for easy client lookup.
 *   - Bigint values are returned as STRINGS (JSON has no native bigint).
 *     The frontend must call BigInt() on them.
 */

export const app = new Hono();

// ---------------------------------------------------------------------------
// GraphQL (Ponder's auto-generated endpoint)
// ---------------------------------------------------------------------------
app.use("/graphql", graphql());

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/healthz", (c) =>
  c.json({ ok: true, ts: Math.floor(Date.now() / 1000) }),
);

// ---------------------------------------------------------------------------
// GET /v1/links/:address
// Returns the user's links, newest depositId first.
//
// Query params:
//   ?status=active      — filter to active links only
//   ?status=refunded    — etc.
//   ?limit=50           — page size (default 50, max 200)
//   ?offset=0           — pagination offset
// ---------------------------------------------------------------------------
app.get("/v1/links/:address", async (c) => {
  const address = c.req.param("address").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return c.json({ error: "Invalid address" }, 400);
  }

  const status = c.req.query("status");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const offset = Math.max(parseInt(c.req.query("offset") ?? "0", 10) || 0, 0);

  const conditions = [eq(links.sender, address as `0x${string}`)];
  if (
    status === "active" ||
    status === "claimed" ||
    status === "refunded" ||
    status === "refund_failed"
  ) {
    conditions.push(eq(links.status, status));
  }

  const rows = await db
    .select()
    .from(links)
    .where(and(...conditions))
    .orderBy(desc(links.depositId))
    .limit(limit)
    .offset(offset);

  // Stringify bigints for JSON.
  return c.json({
    address,
    links: rows.map(stringifyLinkRow),
  });
});

// ---------------------------------------------------------------------------
// GET /v1/links/:address/expired
// Returns ACTIVE links past their expiry — candidates for autoRefund.
//
// Used by the frontend's useAutoRefundExpiredLinks hook (no longer scans
// localStorage) and by an external keeper if desired.
//
// IMPORTANT: The contract's refund() requires `block.timestamp > expiry`
// (strictly after). We use the server's wall clock as a proxy, but block
// timestamps can lag the wall clock by several seconds. We subtract a
// 60-second GRACE PERIOD so callers don't fire refund() txs that would
// revert with NotExpired() — those reverts would otherwise surface as
// "auto-refund failed" in the UI, which is misleading.
// ---------------------------------------------------------------------------
app.get("/v1/links/:address/expired", async (c) => {
  const address = c.req.param("address").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return c.json({ error: "Invalid address" }, 400);
  }

  // 60-second grace period — see file header comment.
  const GRACE_SECONDS = 60n;
  const wallNow = BigInt(Math.floor(Date.now() / 1000));
  const cutoff = wallNow - GRACE_SECONDS;
  const rows = await db
    .select()
    .from(links)
    .where(
      and(
        eq(links.sender, address as `0x${string}`),
        eq(links.status, "active"),
        lt(links.expiry, cutoff),
      ),
    )
    .orderBy(desc(links.expiry));

  return c.json({
    address,
    now: wallNow.toString(),
    graceSeconds: Number(GRACE_SECONDS),
    expired: rows.map(stringifyLinkRow),
  });
});

// ---------------------------------------------------------------------------
// GET /v1/stats/:address
// Aggregate counts grouped by status. Useful for a dashboard badge.
// ---------------------------------------------------------------------------
app.get("/v1/stats/:address", async (c) => {
  const address = c.req.param("address").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) {
    return c.json({ error: "Invalid address" }, 400);
  }

  const rows = await db
    .select({
      status: links.status,
      count: sql<number>`count(*)::int`,
    })
    .from(links)
    .where(eq(links.sender, address as `0x${string}`))
    .groupBy(links.status);

  const stats: Record<string, number> = {
    active: 0,
    claimed: 0,
    refunded: 0,
    refund_failed: 0,
  };
  for (const row of rows) {
    stats[row.status] = row.count;
  }

  return c.json({ address, stats });
});

// ---------------------------------------------------------------------------
// JSON serializer — converts bigint fields to strings.
// ---------------------------------------------------------------------------
function stringifyLinkRow(row: typeof links.$inferSelect) {
  return {
    depositId: row.depositId.toString(),
    sender: row.sender,
    token: row.token,
    amount: row.amount.toString(),
    expiry: row.expiry.toString(),
    status: row.status,
    recipient: row.recipient ?? null,
    createdAtBlock: row.createdAtBlock,
    createdAtTs: row.createdAtTs,
    closedAtBlock: row.closedAtBlock ?? null,
    closedAtTs: row.closedAtTs ?? null,
    chainId: row.chainId,
  };
}

export default app;
