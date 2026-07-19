import { Hono } from "hono";
import { db } from "ponder:api";
import { eq, and, lt, desc, sql } from "drizzle-orm";
import { links } from "ponder:schema";

/**
 * MonliPay indexer HTTP API (Ponder 0.17 — Drizzle ORM).
 *
 * db from ponder:api = readonlyQB.raw = full Drizzle instance.
 *
 * Endpoints:
 *   GET /healthz                 — liveness probe
 *   GET /v1/links/:address       — links by sender (newest first)
 *   GET /v1/links/:address/expired — active links past expiry
 *   GET /v1/stats/:address       — aggregate status counts
 */

export const app = new Hono<{ Variables: { timer: number } }>();

// ---------------------------------------------------------------------------
// Middleware: response timer
// ---------------------------------------------------------------------------
app.use("*", async (c, next) => {
  c.set("timer" as never, Date.now() as never);
  await next();
});

// ---------------------------------------------------------------------------
app.get("/healthz", (c) =>
  c.json({ ok: true, ts: Math.floor(Date.now() / 1000) }),
);

// ---------------------------------------------------------------------------
// GET /v1/links/:address?status=active&limit=50&offset=0
// ---------------------------------------------------------------------------
app.get("/v1/links/:address", async (c) => {
  const address = c.req.param("address").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address))
    return c.json({ error: "Invalid address" }, 400);

  const status = c.req.query("status");
  const limit = Math.min(
    parseInt(c.req.query("limit") ?? "50", 10) || 50,
    200,
  );
  const offset = Math.max(
    parseInt(c.req.query("offset") ?? "0", 10) || 0,
    0,
  );

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

  return c.json({
    address,
    count: rows.length,
    links: rows.map(serializeLink),
  });
});

// ---------------------------------------------------------------------------
// GET /v1/links/:address/expired
// ---------------------------------------------------------------------------
app.get("/v1/links/:address/expired", async (c) => {
  const address = c.req.param("address").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address))
    return c.json({ error: "Invalid address" }, 400);

  const GRACE = 60;
  const cutoff = BigInt(Math.floor(Date.now() / 1000) - GRACE);

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
    now: String(Math.floor(Date.now() / 1000)),
    graceSeconds: GRACE,
    expired: rows.map(serializeLink),
  });
});

// ---------------------------------------------------------------------------
// GET /v1/stats/:address
// ---------------------------------------------------------------------------
app.get("/v1/stats/:address", async (c) => {
  const address = c.req.param("address").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address))
    return c.json({ error: "Invalid address" }, 400);

  const rows = await db
    .select({
      status: links.status,
      count: sql<number>`count(*)::int`.as("count"),
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
  for (const row of rows) stats[row.status] = Number(row.count);

  return c.json({ address, stats });
});

// ---------------------------------------------------------------------------
// Serializer — converts bigint fields to strings for JSON.
// ---------------------------------------------------------------------------
function serializeLink(row: typeof links.$inferSelect) {
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
