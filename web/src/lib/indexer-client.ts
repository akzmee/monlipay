/**
 * Fetch wrapper for the Ponder indexer API.
 *
 * The indexer is proxied through Next.js rewrites (/indexer/* → indexer:42069/*)
 * to avoid CORS issues. In production, NEXT_PUBLIC_INDEXER_URL should be set
 * to the full URL. If not set, defaults to /indexer (Next.js rewrite proxy).
 */

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "/indexer";

/** Always true now — we default to /indexer rewrite proxy. */
export const isIndexerConfigured = INDEXER_URL !== "";

/** Normalized indexer base URL (no trailing slash). */
export const indexerBaseUrl = INDEXER_URL.replace(/\/+$/, "");

/**
 * Shape of a link row returned by the indexer.
 *
 * This matches the `stringifyLinkRow` function in indexer/src/api/index.ts.
 * All bigint fields are returned as STRINGS by the API and converted to
 * native bigint by fetchLinks / fetchExpiredLinks.
 */
export interface IndexedLink {
  depositId: bigint;
  sender: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  expiry: bigint;
  status: "active" | "claimed" | "refunded" | "refund_failed";
  recipient: `0x${string}` | null;
  createdAtBlock: number;
  createdAtTs: number;
  closedAtBlock: number | null;
  closedAtTs: number | null;
  chainId: number;
}

export interface RawLinkRow {
  depositId: string;
  sender: `0x${string}`;
  token: `0x${string}`;
  amount: string;
  expiry: string;
  status: "active" | "claimed" | "refunded" | "refund_failed";
  recipient: `0x${string}` | null;
  createdAtBlock: number;
  createdAtTs: number;
  closedAtBlock: number | null;
  closedAtTs: number | null;
  chainId: number;
}

function parseRow(raw: RawLinkRow): IndexedLink {
  return {
    depositId: BigInt(raw.depositId),
    sender: raw.sender,
    token: raw.token,
    amount: BigInt(raw.amount),
    expiry: BigInt(raw.expiry),
    status: raw.status,
    recipient: raw.recipient,
    createdAtBlock: raw.createdAtBlock,
    createdAtTs: raw.createdAtTs,
    closedAtBlock: raw.closedAtBlock,
    closedAtTs: raw.closedAtTs,
    chainId: raw.chainId,
  };
}

// Exposed for unit tests. Not part of the public API.
export const __test__ = { parseRow };

/**
 * Fetch all links created by `address`, newest depositId first.
 *
 * Returns an empty array if the indexer is not configured or unreachable.
 * Callers should inspect `isIndexerConfigured` to distinguish "no links"
 * from "no indexer" for UI messaging.
 *
 * @param address  Wallet address (case-insensitive).
 * @param status   Optional status filter ("active" / "claimed" / "refunded" / "refund_failed").
 * @param signal   Optional AbortSignal for cancellation.
 */
export async function fetchLinks(
  address: `0x${string}`,
  status?: "active" | "claimed" | "refunded" | "refund_failed",
  signal?: AbortSignal,
): Promise<IndexedLink[]> {
  if (!isIndexerConfigured) return [];
  const url = new URL(
    `${indexerBaseUrl}/v1/links/${address.toLowerCase()}`,
  );
  if (status) url.searchParams.set("status", status);
  url.searchParams.set("limit", "200");

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Indexer responded ${res.status}`);
  }
  const body = (await res.json()) as { links: RawLinkRow[] };
  return body.links.map(parseRow);
}

/** Fetch ACTIVE links past their expiry (autoRefund candidates). */
export async function fetchExpiredLinks(
  address: `0x${string}`,
  signal?: AbortSignal,
): Promise<IndexedLink[]> {
  if (!isIndexerConfigured) return [];
  const url = new URL(
    `${indexerBaseUrl}/v1/links/${address.toLowerCase()}/expired`,
  );
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Indexer responded ${res.status}`);
  }
  const body = (await res.json()) as { expired: RawLinkRow[] };
  return body.expired.map(parseRow);
}

/**
 * Fetch aggregate stats by status.
 */
export async function fetchStats(
  address: `0x${string}`,
  signal?: AbortSignal,
): Promise<{
  active: number;
  claimed: number;
  refunded: number;
  refund_failed: number;
}> {
  if (!isIndexerConfigured) {
    return { active: 0, claimed: 0, refunded: 0, refund_failed: 0 };
  }
  const url = new URL(
    `${indexerBaseUrl}/v1/stats/${address.toLowerCase()}`,
  );
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Indexer responded ${res.status}`);
  }
  const body = (await res.json()) as {
    stats: { active: number; claimed: number; refunded: number; refund_failed: number };
  };
  return body.stats;
}
