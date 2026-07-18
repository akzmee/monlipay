import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// The module under test derives two constants at module-eval time from
// `process.env.NEXT_PUBLIC_INDEXER_URL`:
//
//   export const isIndexerConfigured = INDEXER_URL !== "";
//   export const indexerBaseUrl = INDEXER_URL.replace(/\/+$/, "");
//
// `fetchLinks` / `fetchExpiredLinks` / `fetchStats` close over THESE constants
// (not the env var), so the only way to make them take the "configured" path
// in tests is to ensure the env var is set BEFORE the module is evaluated.
//
// We do that with a hoisted block — `vi.hoisted` runs BEFORE ESM imports are
// resolved — and a dynamic import to ensure the module loads AFTER the env
// var is stubbed. Note that `vi.stubEnv` is safe to call inside `vi.hoisted`.
// ---------------------------------------------------------------------------

const FAKE_BASE = "https://indexer.test.local";

// Set the env var before any module imports resolve.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_INDEXER_URL = "https://indexer.test.local";
});

// Dynamic import so the module evaluates AFTER the hoisted env stub.
const indexerClient = await import("@/lib/indexer-client");
const {
  fetchLinks,
  fetchExpiredLinks,
  fetchStats,
  isIndexerConfigured,
  indexerBaseUrl,
  __test__,
} = indexerClient;
const { parseRow } = __test__;
import type { RawLinkRow } from "@/lib/indexer-client";

// ---------------------------------------------------------------------------
// Sample raw row — matches the shape returned by the indexer's
// stringifyLinkRow() in indexer/src/api/index.ts.
// ---------------------------------------------------------------------------
const SAMPLE_ROW: RawLinkRow = {
  depositId: "42",
  sender: "0xsender",
  token: "0x0000000000000000000000000000000000000000",
  amount: "1000000000000000000",
  expiry: "1700000000",
  status: "active",
  recipient: null,
  createdAtBlock: 100,
  createdAtTs: 1699000000,
  closedAtBlock: null,
  closedAtTs: null,
  chainId: 143,
};

// A valid 40-hex address used in tests (lowercase form expected in URLs).
const ADDR_LOWER = "0xabcdefabcdef1234567890abcdef1234567890ab";
const ADDR_UPPER = "0xABCDEFabcdef1234567890abcdef1234567890AB";
const ZERO_ADDR = "0x" + "0".repeat(40);

// Helper to build a mock fetch Response object.
function mockResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

describe("indexer-client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // Module-level constants
  // -------------------------------------------------------------------------
  describe("module-level configuration", () => {
    it("isIndexerConfigured is true when NEXT_PUBLIC_INDEXER_URL is set", () => {
      // We set NEXT_PUBLIC_INDEXER_URL=FAKE_BASE in the hoisted block.
      expect(isIndexerConfigured).toBe(true);
    });

    it("indexerBaseUrl strips trailing slashes from the env URL", () => {
      // Our stubbed URL has no trailing slash, so it should pass through.
      expect(indexerBaseUrl).toBe(FAKE_BASE);
      expect(indexerBaseUrl.endsWith("/")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // parseRow (exposed for testing)
  // -------------------------------------------------------------------------
  describe("parseRow", () => {
    it("converts string depositId/amount/expiry to bigint", () => {
      const row = parseRow(SAMPLE_ROW);
      expect(row.depositId).toBe(42n);
      expect(row.amount).toBe(1_000_000_000_000_000_000n);
      expect(row.expiry).toBe(1_700_000_000n);
    });

    it("preserves string and number field types", () => {
      const row = parseRow(SAMPLE_ROW);
      expect(row.sender).toBe("0xsender");
      expect(row.token).toBe("0x0000000000000000000000000000000000000000");
      expect(row.status).toBe("active");
      expect(row.recipient).toBeNull();
      expect(row.createdAtBlock).toBe(100);
      expect(row.createdAtTs).toBe(1699000000);
      expect(row.closedAtBlock).toBeNull();
      expect(row.closedAtTs).toBeNull();
      expect(row.chainId).toBe(143);
    });

    it("preserves non-null recipient and closed-at fields (claimed link)", () => {
      const row = parseRow({
        ...SAMPLE_ROW,
        status: "claimed",
        recipient: "0xrecipient",
        closedAtBlock: 200,
        closedAtTs: 1700000000,
      });
      expect(row.status).toBe("claimed");
      expect(row.recipient).toBe("0xrecipient");
      expect(row.closedAtBlock).toBe(200);
      expect(row.closedAtTs).toBe(1700000000);
    });

    it("handles very large bigint values without precision loss", () => {
      // 2^100 — way beyond Number.MAX_SAFE_INTEGER, must be parsed as BigInt.
      const hugeAmount = (1n << 100n).toString();
      const row = parseRow({
        ...SAMPLE_ROW,
        amount: hugeAmount,
        depositId: (1n << 200n).toString(),
      });
      expect(row.amount).toBe(1n << 100n);
      expect(row.depositId).toBe(1n << 200n);
    });

    it("passes through each allowed status value", () => {
      const statuses = [
        "active",
        "claimed",
        "refunded",
        "refund_failed",
      ] as const;
      for (const status of statuses) {
        expect(parseRow({ ...SAMPLE_ROW, status }).status).toBe(status);
      }
    });
  });

  // -------------------------------------------------------------------------
  // fetchLinks
  // -------------------------------------------------------------------------
  describe("fetchLinks", () => {
    it("returns parsed links on a 200 response", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ links: [SAMPLE_ROW] }),
      );
      const result = await fetchLinks(ADDR_LOWER as `0x${string}`);
      expect(result).toHaveLength(1);
      expect(result[0].depositId).toBe(42n);
      expect(result[0].amount).toBe(1_000_000_000_000_000_000n);
    });

    it("returns an empty array when the API returns no links", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ links: [] }),
      );
      const result = await fetchLinks(ADDR_LOWER as `0x${string}`);
      expect(result).toEqual([]);
    });

    it("throws 'Indexer responded <status>' on non-OK response", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ error: "boom" }, false, 500),
      );
      await expect(
        fetchLinks(ADDR_LOWER as `0x${string}`),
      ).rejects.toThrow("Indexer responded 500");
    });

    it("throws on 404 responses too", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ error: "not found" }, false, 404),
      );
      await expect(
        fetchLinks(ADDR_LOWER as `0x${string}`),
      ).rejects.toThrow("Indexer responded 404");
    });

    it("constructs the URL with the lowercased address", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ links: [] }),
      );
      await fetchLinks(ADDR_UPPER as `0x${string}`);
      const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(calledUrl.toString()).toBe(
        `${FAKE_BASE}/v1/links/${ADDR_LOWER}?limit=200`,
      );
    });

    it("appends status filter when provided", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ links: [] }),
      );
      await fetchLinks(ADDR_LOWER as `0x${string}`, "claimed");
      const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(calledUrl.searchParams.get("status")).toBe("claimed");
      // limit is still present
      expect(calledUrl.searchParams.get("limit")).toBe("200");
    });

    it("appends status filter for each supported status", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ links: [] }),
      );
      const statuses = [
        "active",
        "claimed",
        "refunded",
        "refund_failed",
      ] as const;
      for (const status of statuses) {
        await fetchLinks(ADDR_LOWER as `0x${string}`, status);
      }
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0].searchParams.get("status")).toBe("active");
      expect(calls[1][0].searchParams.get("status")).toBe("claimed");
      expect(calls[2][0].searchParams.get("status")).toBe("refunded");
      expect(calls[3][0].searchParams.get("status")).toBe("refund_failed");
    });

    it("always sets limit=200", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ links: [] }),
      );
      await fetchLinks(ADDR_LOWER as `0x${string}`);
      const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(calledUrl.searchParams.get("limit")).toBe("200");
    });

    it("passes the AbortSignal through to fetch", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ links: [] }),
      );
      const controller = new AbortController();
      await fetchLinks(ADDR_LOWER as `0x${string}`, undefined, controller.signal);
      const fetchOpts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(fetchOpts.signal).toBe(controller.signal);
    });

    it("propagates network errors from fetch", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new TypeError("failed to fetch"),
      );
      await expect(
        fetchLinks(ADDR_LOWER as `0x${string}`),
      ).rejects.toThrow("failed to fetch");
    });

    it("propagates AbortError from an aborted signal", async () => {
      const controller = new AbortController();
      controller.abort();
      (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new DOMException("Aborted", "AbortError"),
      );
      await expect(
        fetchLinks(ADDR_LOWER as `0x${string}`, undefined, controller.signal),
      ).rejects.toThrow("Aborted");
    });

    it("parses multiple rows preserving order", async () => {
      const rows = [
        { ...SAMPLE_ROW, depositId: "3" },
        { ...SAMPLE_ROW, depositId: "2" },
        { ...SAMPLE_ROW, depositId: "1" },
      ];
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ links: rows }),
      );
      const result = await fetchLinks(ADDR_LOWER as `0x${string}`);
      expect(result.map((r) => r.depositId)).toEqual([3n, 2n, 1n]);
    });

    it("accepts a 0-address sender", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ links: [] }),
      );
      await fetchLinks(ZERO_ADDR as `0x${string}`);
      const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(calledUrl.pathname).toBe(`/v1/links/${ZERO_ADDR}`);
    });
  });

  // -------------------------------------------------------------------------
  // fetchExpiredLinks
  // -------------------------------------------------------------------------
  describe("fetchExpiredLinks", () => {
    it("returns parsed links from the 'expired' key", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ expired: [SAMPLE_ROW] }),
      );
      const result = await fetchExpiredLinks(ADDR_LOWER as `0x${string}`);
      expect(result).toHaveLength(1);
      expect(result[0].depositId).toBe(42n);
    });

    it("returns an empty array when the API returns no expired links", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ expired: [] }),
      );
      const result = await fetchExpiredLinks(ADDR_LOWER as `0x${string}`);
      expect(result).toEqual([]);
    });

    it("throws on non-OK response", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({}, false, 503),
      );
      await expect(
        fetchExpiredLinks(ADDR_LOWER as `0x${string}`),
      ).rejects.toThrow("Indexer responded 503");
    });

    it("constructs the URL with /expired suffix and lowercased address", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ expired: [] }),
      );
      await fetchExpiredLinks(ADDR_UPPER as `0x${string}`);
      const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(calledUrl.toString()).toBe(
        `${FAKE_BASE}/v1/links/${ADDR_LOWER}/expired`,
      );
    });

    it("passes the AbortSignal through to fetch", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ expired: [] }),
      );
      const controller = new AbortController();
      await fetchExpiredLinks(ADDR_LOWER as `0x${string}`, controller.signal);
      const fetchOpts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(fetchOpts.signal).toBe(controller.signal);
    });

    it("propagates network errors from fetch", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
        new TypeError("network down"),
      );
      await expect(
        fetchExpiredLinks(ADDR_LOWER as `0x${string}`),
      ).rejects.toThrow("network down");
    });

    it("parses multiple expired rows preserving order", async () => {
      const rows = [
        { ...SAMPLE_ROW, depositId: "10" },
        { ...SAMPLE_ROW, depositId: "20" },
      ];
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ expired: rows }),
      );
      const result = await fetchExpiredLinks(ADDR_LOWER as `0x${string}`);
      expect(result.map((r) => r.depositId)).toEqual([10n, 20n]);
    });
  });

  // -------------------------------------------------------------------------
  // fetchStats
  // -------------------------------------------------------------------------
  describe("fetchStats", () => {
    it("returns the stats object on a 200 response", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({
          stats: { active: 3, claimed: 2, refunded: 1, refund_failed: 0 },
        }),
      );
      const result = await fetchStats(ADDR_LOWER as `0x${string}`);
      expect(result).toEqual({
        active: 3,
        claimed: 2,
        refunded: 1,
        refund_failed: 0,
      });
    });

    it("handles zero counts", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({
          stats: { active: 0, claimed: 0, refunded: 0, refund_failed: 0 },
        }),
      );
      const result = await fetchStats(ADDR_LOWER as `0x${string}`);
      expect(result).toEqual({
        active: 0,
        claimed: 0,
        refunded: 0,
        refund_failed: 0,
      });
    });

    it("throws on non-OK response", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({}, false, 500),
      );
      await expect(
        fetchStats(ADDR_LOWER as `0x${string}`),
      ).rejects.toThrow("Indexer responded 500");
    });

    it("constructs the URL with lowercased address under /v1/stats/", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ stats: { active: 0, claimed: 0, refunded: 0, refund_failed: 0 } }),
      );
      await fetchStats(ADDR_UPPER as `0x${string}`);
      const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(calledUrl.toString()).toBe(
        `${FAKE_BASE}/v1/stats/${ADDR_LOWER}`,
      );
    });

    it("passes the AbortSignal through to fetch", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockResponse({ stats: { active: 0, claimed: 0, refunded: 0, refund_failed: 0 } }),
      );
      const controller = new AbortController();
      await fetchStats(ADDR_LOWER as `0x${string}`, controller.signal);
      const fetchOpts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(fetchOpts.signal).toBe(controller.signal);
    });
  });
});
