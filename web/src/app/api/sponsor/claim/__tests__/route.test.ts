import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Address, Hex } from "viem";

/**
 * Tests for POST /api/sponsor/claim.
 *
 * The route handler is thin: it validates the JSON body, parses bigint
 * fields from strings, and forwards the request to relaySponsoredClaim.
 * We mock the relay so we can verify the route's parsing + HTTP mapping.
 *
 * Strategy:
 *   - Mock @/lib/sponsor-server so the relay's behavior is controllable
 *   - Mock @/lib/rate-limit#getClientIp to return a deterministic IP
 *   - Construct Request objects with various JSON bodies
 *   - Assert status codes + response bodies match the RelayResult mapping
 */

const VALID_FROM = "0x1111111111111111111111111111111111111111" as Address;
const VALID_TO = "0xEB9a0BC1c7518F839B8F249E407A1AfC011E0aB3" as Address;
const VALID_DATA = "0xf7121490" + "00".repeat(320) as Hex;
const VALID_SIG = "0x" + "ab".repeat(65) as Hex;

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockRelaySponsoredClaim = vi.fn();
const mockGetClientIp = vi.fn();

vi.mock("@/lib/sponsor-server", () => ({
  relaySponsoredClaim: (...args: unknown[]) => mockRelaySponsoredClaim(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/sponsor/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function makeValidRequestBody(overrides: Record<string, unknown> = {}) {
  return {
    request: {
      from: VALID_FROM,
      to: VALID_TO,
      value: "0",
      gas: "500000",
      nonce: "0",
      deadline: Math.floor(Date.now() / 1000) + 3600,
      data: VALID_DATA,
      signature: VALID_SIG,
      ...overrides,
    },
  };
}

describe("POST /api/sponsor/claim", () => {
  beforeEach(() => {
    mockRelaySponsoredClaim.mockReset();
    mockGetClientIp.mockReset();
    mockGetClientIp.mockReturnValue("203.0.113.42");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Body parsing
  // -------------------------------------------------------------------------

  it("returns 400 on malformed JSON", async () => {
    const route = await import("@/app/api/sponsor/claim/route");
    const req = new Request("http://localhost/api/sponsor/claim", {
      method: "POST",
      body: "{not valid json",
    });
    const res = await route.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("invalid_request");
  });

  it("returns 400 when body is too large (>8KB)", async () => {
    const route = await import("@/app/api/sponsor/claim/route");
    // Build an 8KB+ body by padding the data field
    const bigData = "0x" + "ab".repeat(5000);
    const req = makeJsonRequest({
      ...makeValidRequestBody().request,
      data: bigData,
    });
    const res = await route.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("invalid_request");
    expect(body.message).toMatch(/too large/i);
  });

  it("returns 400 when the `request` field is missing", async () => {
    const route = await import("@/app/api/sponsor/claim/route");
    const req = makeJsonRequest({ other: "nope" });
    const res = await route.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("invalid_request");
  });

  it("returns 400 when `from` is not a valid address", async () => {
    const route = await import("@/app/api/sponsor/claim/route");
    const req = makeJsonRequest(
      makeValidRequestBody({ from: "not-an-address" }).request,
    );
    const res = await route.POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when `to` is not a valid address", async () => {
    const route = await import("@/app/api/sponsor/claim/route");
    const req = makeJsonRequest(
      makeValidRequestBody({ to: "0x123" }).request,
    );
    const res = await route.POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when `value` is not a decimal string", async () => {
    const route = await import("@/app/api/sponsor/claim/route");
    const req = makeJsonRequest(
      makeValidRequestBody({ value: 123 }).request,
    );
    const res = await route.POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when `gas` has non-digit characters", async () => {
    const route = await import("@/app/api/sponsor/claim/route");
    const req = makeJsonRequest(
      makeValidRequestBody({ gas: "0x123" }).request,
    );
    const res = await route.POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when `deadline` is non-numeric", async () => {
    const route = await import("@/app/api/sponsor/claim/route");
    const req = makeJsonRequest(
      makeValidRequestBody({ deadline: "tomorrow" }).request,
    );
    const res = await route.POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when `deadline` is negative or zero", async () => {
    const route = await import("@/app/api/sponsor/claim/route");
    const req1 = makeJsonRequest(makeValidRequestBody({ deadline: 0 }).request);
    const res1 = await route.POST(req1);
    expect(res1.status).toBe(400);

    const req2 = makeJsonRequest(
      makeValidRequestBody({ deadline: -1 }).request,
    );
    const res2 = await route.POST(req2);
    expect(res2.status).toBe(400);
  });

  it("returns 400 when `data` is not hex", async () => {
    const route = await import("@/app/api/sponsor/claim/route");
    const req = makeJsonRequest(
      makeValidRequestBody({ data: "nope" }).request,
    );
    const res = await route.POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when `signature` is not hex", async () => {
    const route = await import("@/app/api/sponsor/claim/route");
    const req = makeJsonRequest(
      makeValidRequestBody({ signature: "abcdef" }).request,
    );
    const res = await route.POST(req);
    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Client IP extraction + relay forwarding
  // -------------------------------------------------------------------------

  it("extracts client IP via getClientIp and passes it to relay", async () => {
    mockGetClientIp.mockReturnValue("198.51.100.1");
    mockRelaySponsoredClaim.mockResolvedValue({ ok: true, txHash: "0xabc" });
    const route = await import("@/app/api/sponsor/claim/route");
    const req = makeJsonRequest(makeValidRequestBody());
    await route.POST(req);
    expect(mockGetClientIp).toHaveBeenCalledTimes(1);
    expect(mockRelaySponsoredClaim).toHaveBeenCalledWith({
      request: expect.objectContaining({ from: VALID_FROM }),
      clientIp: "198.51.100.1",
    });
  });

  it("converts string bigint fields to native bigint when forwarding", async () => {
    mockRelaySponsoredClaim.mockResolvedValue({ ok: true, txHash: "0xabc" });
    const route = await import("@/app/api/sponsor/claim/route");
    const req = makeJsonRequest(makeValidRequestBody());
    await route.POST(req);
    const forwarded = mockRelaySponsoredClaim.mock.calls[0][0].request;
    expect(typeof forwarded.value).toBe("bigint");
    expect(forwarded.value).toBe(0n);
    expect(typeof forwarded.gas).toBe("bigint");
    expect(forwarded.gas).toBe(500_000n);
    expect(typeof forwarded.nonce).toBe("bigint");
    expect(forwarded.nonce).toBe(0n);
  });

  // -------------------------------------------------------------------------
  // HTTP response mapping
  // -------------------------------------------------------------------------

  it("returns 200 + txHash on successful relay", async () => {
    const TX_HASH = "0x" + "cd".repeat(32);
    mockRelaySponsoredClaim.mockResolvedValue({ ok: true, txHash: TX_HASH });
    const route = await import("@/app/api/sponsor/claim/route");
    const res = await route.POST(makeJsonRequest(makeValidRequestBody()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.txHash).toBe(TX_HASH);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 503 + not_configured mapping", async () => {
    mockRelaySponsoredClaim.mockResolvedValue({
      ok: false,
      reason: "not_configured",
    });
    const route = await import("@/app/api/sponsor/claim/route");
    const res = await route.POST(makeJsonRequest(makeValidRequestBody()));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("not_configured");
  });

  it("returns 429 + Retry-After on rate_limited", async () => {
    mockRelaySponsoredClaim.mockResolvedValue({
      ok: false,
      reason: "rate_limited",
      retryAfterSeconds: 60,
    });
    const route = await import("@/app/api/sponsor/claim/route");
    const res = await route.POST(makeJsonRequest(makeValidRequestBody()));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("rate_limited");
  });

  it("returns 503 + Retry-After on budget_exhausted", async () => {
    mockRelaySponsoredClaim.mockResolvedValue({
      ok: false,
      reason: "budget_exhausted",
      retryAfterSeconds: 3600,
    });
    const route = await import("@/app/api/sponsor/claim/route");
    const res = await route.POST(makeJsonRequest(makeValidRequestBody()));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("3600");
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("budget_exhausted");
  });

  it("returns 400 on invalid_request", async () => {
    mockRelaySponsoredClaim.mockResolvedValue({
      ok: false,
      reason: "invalid_request",
      message: "Allowlist rejection.",
    });
    const route = await import("@/app/api/sponsor/claim/route");
    const res = await route.POST(makeJsonRequest(makeValidRequestBody()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("invalid_request");
    expect(body.message).toMatch(/Allowlist/);
  });

  it("returns 500 on relay_failed", async () => {
    mockRelaySponsoredClaim.mockResolvedValue({
      ok: false,
      reason: "relay_failed",
      message: "RPC error.",
    });
    const route = await import("@/app/api/sponsor/claim/route");
    const res = await route.POST(makeJsonRequest(makeValidRequestBody()));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("relay_failed");
  });
});
