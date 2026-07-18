import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Address, Hex } from "viem";

/**
 * Tests for sponsor-client.ts.
 *
 * Strategy:
 *   - Mock fetch() to control API responses
 *   - Mock the crypto module's signClaim to avoid needing the actual
 *     EIP-712 signing machinery in these unit tests
 *   - Mock viem's createPublicClient (used by readForwarderNonce and
 *     readForwarderDomain)
 *   - Test serializeRequest as a pure function
 *   - Test sponsorClaim through all branches: success, network error,
 *     and each RelayResult reason
 */

const VALID_FORWARDER = "0x1111111111111111111111111111111111111111" as Address;
const VAULT_ADDR = "0xEB9a0BC1c7518F839B8F249E407A1AfC011E0aB3" as Address;
const RECIPIENT = "0x2222222222222222222222222222222222222222" as Address;
const SECRET_KEY =
  "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318" as Hex;
const DEPOSIT_ID = 1n;
const TX_HASH = "0x" + "ab".repeat(32) as Hex;

// ---------------------------------------------------------------------------
// Module-level mocks (must be hoisted)
// ---------------------------------------------------------------------------

// Mock the crypto module — signClaim should return deterministic v/r/s.
vi.mock("@/lib/crypto", () => ({
  signClaim: vi.fn().mockResolvedValue({
    v: 27,
    r: "0x" + "00".repeat(32),
    s: "0x" + "01".repeat(32),
  }),
}));

// Mock viem so that:
//   - createPublicClient returns a stub whose readContract is configurable
//   - privateKeyToAccount returns a stub account with a known address
//   - signTypedData returns a deterministic signature
//   - encodeFunctionData returns a recognizable stub
const mockReadContract = vi.fn();
const mockSignTypedData = vi.fn();

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({
      readContract: mockReadContract,
    }),
    encodeFunctionData: actual.encodeFunctionData,
    decodeFunctionData: actual.decodeFunctionData,
  };
});

vi.mock("viem/accounts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("viem/accounts")>();
  return {
    ...actual,
    privateKeyToAccount: (key: Hex) => ({
      address: "0x3333333333333333333333333333333333333333" as Address,
      signTypedData: mockSignTypedData,
      source: "privateKey",
    }),
  };
});

describe("sponsor-client", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_GAS_SPONSOR_ENABLED = "true";
    process.env.NEXT_PUBLIC_GAS_FORWARDER_ADDRESS = VALID_FORWARDER;
    process.env.NEXT_PUBLIC_LINK_VAULT_ADDRESS = VAULT_ADDR;
    process.env.NEXT_PUBLIC_NETWORK = "testnet";

    mockReadContract.mockReset();
    mockSignTypedData.mockReset();
    mockSignTypedData.mockResolvedValue("0x" + "ee".repeat(32));
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // -------------------------------------------------------------------------
  // serializeRequest
  // -------------------------------------------------------------------------

  describe("serializeRequest", () => {
    it("converts bigint fields to decimal strings", async () => {
      const mod = await import("@/lib/sponsor-client");
      const serialized = mod.serializeRequest({
        from: "0x1111111111111111111111111111111111111111" as Address,
        to: "0x2222222222222222222222222222222222222222" as Address,
        value: 0n,
        gas: 500_000n,
        nonce: 7n,
        deadline: 1700000000,
        data: "0xabcdef" as Hex,
        signature: "0x1234" as Hex,
      });
      expect(serialized.value).toBe("0");
      expect(serialized.gas).toBe("500000");
      expect(serialized.nonce).toBe("7");
      expect(serialized.deadline).toBe(1700000000);
      expect(serialized.from).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(serialized.to).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(serialized.data).toBe("0xabcdef");
      expect(serialized.signature).toBe("0x1234");
    });

    it("preserves large bigint values exactly", async () => {
      const mod = await import("@/lib/sponsor-client");
      const serialized = mod.serializeRequest({
        from: "0x1111111111111111111111111111111111111111" as Address,
        to: "0x2222222222222222222222222222222222222222" as Address,
        value: 2n ** 100n,
        gas: 5_000_000n,
        nonce: 123456789012345n,
        deadline: 1700000000,
        data: "0x" as Hex,
        signature: "0x" as Hex,
      });
      // 2^100 in decimal
      expect(serialized.value).toBe("1267650600228229401496703205376");
      expect(serialized.nonce).toBe("123456789012345");
    });
  });

  // -------------------------------------------------------------------------
  // sponsorClaim — early exit when sponsor not configured
  // -------------------------------------------------------------------------

  describe("sponsorClaim — not_configured path", () => {
    it("returns not_configured when isGasSponsorAvailable is false", async () => {
      delete process.env.NEXT_PUBLIC_GAS_SPONSOR_ENABLED;
      vi.resetModules();
      const mod = await import("@/lib/sponsor-client");
      const result = await mod.sponsorClaim({
        depositId: DEPOSIT_ID,
        secretKey: SECRET_KEY,
        recipient: RECIPIENT,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("not_configured");
      }
    });
  });

  // -------------------------------------------------------------------------
  // sponsorClaim — happy path
  // -------------------------------------------------------------------------

  describe("sponsorClaim — success path", () => {
    it("calls fetch with serialized request and returns ok on 200", async () => {
      // Stub forwarder nonce + domain reads
      mockReadContract
        // First call: nonce
        .mockResolvedValueOnce(42n)
        // Second call: eip712Domain
        .mockResolvedValueOnce([
          "0x0f",
          "MonliPay LinkVault",
          "1",
          10143n,
          VALID_FORWARDER,
          "0x" + "00".repeat(32),
          [],
        ]);

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, txHash: TX_HASH }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const mod = await import("@/lib/sponsor-client");
      const result = await mod.sponsorClaim({
        depositId: DEPOSIT_ID,
        secretKey: SECRET_KEY,
        recipient: RECIPIENT,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.txHash).toBe(TX_HASH);
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/sponsor/claim");
      expect(init.method).toBe("POST");
      // Body should contain the serialized ForwardRequestData
      const body = JSON.parse(init.body as string);
      expect(body.request).toBeDefined();
      expect(body.request.from).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(body.request.value).toBe("0");
      expect(body.request.gas).toBe("500000");
      expect(body.request.nonce).toBe("42");
    });

    it("uses the cached domain on subsequent calls", async () => {
      // Force first call to fetch the domain; second call should reuse cache.
      mockReadContract
        .mockResolvedValueOnce(0n) // nonce (first call)
        .mockResolvedValueOnce([
          "0x0f",
          "MonliPay LinkVault",
          "1",
          10143n,
          VALID_FORWARDER,
          "0x" + "00".repeat(32),
          [],
        ])
        .mockResolvedValueOnce(1n); // nonce (second call) — NO domain read

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, txHash: TX_HASH }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const mod = await import("@/lib/sponsor-client");
      // Clear cache at start
      mod._clearDomainCache();

      await mod.sponsorClaim({
        depositId: DEPOSIT_ID,
        secretKey: SECRET_KEY,
        recipient: RECIPIENT,
      });
      await mod.sponsorClaim({
        depositId: 2n,
        secretKey: SECRET_KEY,
        recipient: RECIPIENT,
      });

      // readContract should have been called 3 times total: nonce, domain,
      // nonce. The second call should NOT have read the domain again.
      expect(mockReadContract).toHaveBeenCalledTimes(3);
    });
  });

  // -------------------------------------------------------------------------
  // sponsorClaim — error mapping
  // -------------------------------------------------------------------------

  describe("sponsorClaim — error mapping from API response", () => {
    beforeEach(() => {
      mockReadContract
        .mockResolvedValueOnce(0n)
        .mockResolvedValueOnce([
          "0x0f",
          "MonliPay LinkVault",
          "1",
          10143n,
          VALID_FORWARDER,
          "0x" + "00".repeat(32),
          [],
        ]);
    });

    it("maps 429 + rate_limited reason", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          ok: false,
          reason: "rate_limited",
          message: "Too many requests.",
        }),
      }) as unknown as typeof fetch;

      const mod = await import("@/lib/sponsor-client");
      const result = await mod.sponsorClaim({
        depositId: DEPOSIT_ID,
        secretKey: SECRET_KEY,
        recipient: RECIPIENT,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("rate_limited");
        expect(result.message).toMatch(/Too many/);
      }
    });

    it("maps 503 + budget_exhausted reason", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          ok: false,
          reason: "budget_exhausted",
          message: "Daily sponsor budget exhausted.",
        }),
      }) as unknown as typeof fetch;

      const mod = await import("@/lib/sponsor-client");
      const result = await mod.sponsorClaim({
        depositId: DEPOSIT_ID,
        secretKey: SECRET_KEY,
        recipient: RECIPIENT,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("budget_exhausted");
      }
    });

    it("maps 503 + not_configured reason", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ ok: false, reason: "not_configured" }),
      }) as unknown as typeof fetch;

      const mod = await import("@/lib/sponsor-client");
      const result = await mod.sponsorClaim({
        depositId: DEPOSIT_ID,
        secretKey: SECRET_KEY,
        recipient: RECIPIENT,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("not_configured");
      }
    });

    it("maps 400 + invalid_request reason", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          ok: false,
          reason: "invalid_request",
          message: "Bad from address.",
        }),
      }) as unknown as typeof fetch;

      const mod = await import("@/lib/sponsor-client");
      const result = await mod.sponsorClaim({
        depositId: DEPOSIT_ID,
        secretKey: SECRET_KEY,
        recipient: RECIPIENT,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("invalid_request");
      }
    });

    it("maps 500 + relay_failed reason", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          ok: false,
          reason: "relay_failed",
          message: "RPC error.",
        }),
      }) as unknown as typeof fetch;

      const mod = await import("@/lib/sponsor-client");
      const result = await mod.sponsorClaim({
        depositId: DEPOSIT_ID,
        secretKey: SECRET_KEY,
        recipient: RECIPIENT,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("relay_failed");
      }
    });
  });

  // -------------------------------------------------------------------------
  // sponsorClaim — network errors
  // -------------------------------------------------------------------------

  describe("sponsorClaim — network errors", () => {
    it("returns network_error when fetch throws", async () => {
      mockReadContract
        .mockResolvedValueOnce(0n)
        .mockResolvedValueOnce([
          "0x0f",
          "MonliPay LinkVault",
          "1",
          10143n,
          VALID_FORWARDER,
          "0x" + "00".repeat(32),
          [],
        ]);
      global.fetch = vi
        .fn()
        .mockRejectedValue(new Error("Network down")) as unknown as typeof fetch;

      const mod = await import("@/lib/sponsor-client");
      const result = await mod.sponsorClaim({
        depositId: DEPOSIT_ID,
        secretKey: SECRET_KEY,
        recipient: RECIPIENT,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("network_error");
        expect(result.message).toMatch(/Network down/);
      }
    });

    it("returns network_error when nonce read fails", async () => {
      mockReadContract.mockRejectedValueOnce(new Error("RPC timeout"));

      const mod = await import("@/lib/sponsor-client");
      const result = await mod.sponsorClaim({
        depositId: DEPOSIT_ID,
        secretKey: SECRET_KEY,
        recipient: RECIPIENT,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("network_error");
        expect(result.message).toMatch(/RPC timeout/);
      }
    });

    it("never throws — always returns a SponsorClaimResult", async () => {
      mockReadContract.mockRejectedValue(new Error("Anything"));
      global.fetch = vi
        .fn()
        .mockRejectedValue(new Error("Whatever")) as unknown as typeof fetch;

      const mod = await import("@/lib/sponsor-client");
      // The contract of sponsorClaim is "this function never throws".
      // We verify by calling it and ensuring no exception propagates.
      const result = await mod.sponsorClaim({
        depositId: DEPOSIT_ID,
        secretKey: SECRET_KEY,
        recipient: RECIPIENT,
      });
      expect(result.ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // _clearDomainCache
  // -------------------------------------------------------------------------

  describe("_clearDomainCache", () => {
    it("is exported and callable", async () => {
      const mod = await import("@/lib/sponsor-client");
      expect(typeof mod._clearDomainCache).toBe("function");
      expect(() => mod._clearDomainCache()).not.toThrow();
    });
  });
});
