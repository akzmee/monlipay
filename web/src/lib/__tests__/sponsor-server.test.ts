import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Address, Hex } from "viem";

/**
 * Tests for sponsor-server.ts.
 *
 * Strategy:
 *   - This module reads env vars at module-load time, so we use
 *     vi.resetModules() + dynamic imports for config permutations.
 *   - The chain-write path (writeContract) is mocked by intercepting
 *     viem's createWalletClient via vi.mock BEFORE the module loads.
 *   - The internal `_resetBudgetForTest` helper lets us reset budget
 *     state between tests.
 *
 * The tests focus on safety guarantees:
 *   - Budget enforcement
 *   - Rate limiting (per IP / recipient / deposit)
 *   - Request shape validation
 *   - Allowlist (only LinkVault.claim, not arbitrary calls)
 */

const VALID_FORWARDER = "0x1111111111111111111111111111111111111111" as Address;
const VAULT_ADDR = "0xEB9a0BC1c7518F839B8F249E407A1AfC011E0aB3" as Address;
const VALID_PRIVATE_KEY =
  "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
const RECIPIENT = "0x2222222222222222222222222222222222222222" as Address;
const FROM_ADDR = "0x3333333333333333333333333333333333333333" as Address;

/** Build syntactically valid claim() calldata for a given depositId + recipient. */
function makeClaimData(depositId: bigint, recipient: Address): Hex {
  // claim(uint256,address,uint8,bytes32,bytes32) — selector 0xf7121490
  return (
    "0xf7121490" +
    depositId.toString(16).padStart(64, "0") +
    recipient.toLowerCase().slice(2).padStart(64, "0") +
    "000000000000000000000000000000000000000000000000000000000000001b" + // v=27
    "0000000000000000000000000000000000000000000000000000000000000000" + // r
    "0000000000000000000000000000000000000000000000000000000000000000" // s
  ) as Hex;
}

/** Build a syntactically valid ForwardRequestData for testing. */
function makeRequest(overrides: Partial<{
  from: Address;
  to: Address;
  value: bigint;
  gas: bigint;
  nonce: bigint;
  deadline: number;
  data: Hex;
  signature: Hex;
}> = {}) {
  return {
    from: FROM_ADDR,
    to: VAULT_ADDR,
    value: 0n,
    gas: 500_000n,
    nonce: 0n,
    deadline: Math.floor(Date.now() / 1000) + 3600,
    // claim(depositId=1, recipient=0x2222..., v=27, r=0x00..., s=0x00...)
    // Selector 0xf7121490 + encoded args. Length is correct for the 5-arg
    // signature; the contents don't matter because we mock the chain call.
    data: makeClaimData(1n, RECIPIENT),
    signature: "0x".padEnd(132, "0") as Hex,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// viem mock
// ---------------------------------------------------------------------------
// sponsor-server.ts imports createWalletClient from "viem" lazily inside
// getSponsorClient(). We mock the entire "viem" module to return a stub
// client whose writeContract behavior we control per-test.
//
// NOTE: The mock factory must be defined at top-level for vi.mock to hoist.
// Inside the factory we re-export everything from real viem EXCEPT
// createWalletClient, which gets replaced with a controllable stub.

const mockWriteContract = vi.fn();

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createWalletClient: (opts: unknown) => {
      // Return a minimal stub. The sponsor-server only uses:
      //   client.writeContract(...)
      //   client.chain  (for the chain arg pass-through)
      return {
        writeContract: mockWriteContract,
        chain: (opts as { chain?: { id: number } })?.chain ?? { id: 10143 },
      };
    },
  };
});

describe("sponsor-server", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set env BEFORE importing the module.
    process.env.NEXT_PUBLIC_GAS_SPONSOR_ENABLED = "true";
    process.env.NEXT_PUBLIC_GAS_FORWARDER_ADDRESS = VALID_FORWARDER;
    process.env.GAS_SPONSOR_PRIVATE_KEY = VALID_PRIVATE_KEY;
    process.env.GAS_SPONSOR_DAILY_BUDGET_MON = "1.0";
    process.env.NEXT_PUBLIC_LINK_VAULT_ADDRESS = VAULT_ADDR;
    process.env.NEXT_PUBLIC_NETWORK = "testnet";
    mockWriteContract.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  describe("getSponsorAddress", () => {
    it("returns the sponsor wallet address when configured", async () => {
      const mod = await import("@/lib/sponsor-server");
      const addr = mod.getSponsorAddress();
      expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(addr).not.toBe("0x0000000000000000000000000000000000000000");
    });

    it("returns zero address when not configured", async () => {
      delete process.env.GAS_SPONSOR_PRIVATE_KEY;
      vi.resetModules();
      const mod = await import("@/lib/sponsor-server");
      const addr = mod.getSponsorAddress();
      expect(addr).toBe("0x0000000000000000000000000000000000000000");
    });
  });

  describe("getRemainingBudgetMon", () => {
    it("returns full budget at fresh state", async () => {
      const mod = await import("@/lib/sponsor-server");
      mod._resetBudgetForTest();
      const remaining = mod.getRemainingBudgetMon();
      expect(remaining).toBeGreaterThan(0.99);
      expect(remaining).toBeLessThanOrEqual(1.0);
    });

    it("returns the configured budget value", async () => {
      process.env.GAS_SPONSOR_DAILY_BUDGET_MON = "5.0";
      vi.resetModules();
      const mod = await import("@/lib/sponsor-server");
      mod._resetBudgetForTest();
      const remaining = mod.getRemainingBudgetMon();
      expect(remaining).toBeGreaterThan(4.99);
      expect(remaining).toBeLessThanOrEqual(5.0);
    });

    it("returns 0 when daily budget env is 0", async () => {
      process.env.GAS_SPONSOR_DAILY_BUDGET_MON = "0";
      vi.resetModules();
      const mod = await import("@/lib/sponsor-server");
      mod._resetBudgetForTest();
      expect(mod.getRemainingBudgetMon()).toBe(0);
    });
  });

  describe("relaySponsoredClaim - rejection paths (no chain writes)", () => {
    it("rejects with not_configured when sponsor key is missing", async () => {
      delete process.env.GAS_SPONSOR_PRIVATE_KEY;
      vi.resetModules();
      const mod = await import("@/lib/sponsor-server");
      const result = await mod.relaySponsoredClaim({
        request: makeRequest(),
        clientIp: "1.2.3.4",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("not_configured");
      }
    });

    it("rejects with invalid_request when from address is malformed", async () => {
      const mod = await import("@/lib/sponsor-server");
      const result = await mod.relaySponsoredClaim({
        request: { ...makeRequest(), from: "not-an-address" as Address },
        clientIp: "1.2.3.4",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("invalid_request");
      }
    });

    it("rejects with invalid_request when gas is zero", async () => {
      const mod = await import("@/lib/sponsor-server");
      const result = await mod.relaySponsoredClaim({
        request: { ...makeRequest(), gas: 0n },
        clientIp: "1.2.3.4",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("invalid_request");
      }
    });

    it("rejects with invalid_request when gas exceeds 5M", async () => {
      const mod = await import("@/lib/sponsor-server");
      const result = await mod.relaySponsoredClaim({
        request: { ...makeRequest(), gas: 6_000_000n },
        clientIp: "1.2.3.4",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("invalid_request");
      }
    });

    it("rejects with invalid_request when value is negative", async () => {
      const mod = await import("@/lib/sponsor-server");
      const result = await mod.relaySponsoredClaim({
        request: { ...makeRequest(), value: -1n },
        clientIp: "1.2.3.4",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("invalid_request");
      }
    });

    it("rejects with invalid_request when data is not hex", async () => {
      const mod = await import("@/lib/sponsor-server");
      const result = await mod.relaySponsoredClaim({
        request: { ...makeRequest(), data: "not-hex" as Hex },
        clientIp: "1.2.3.4",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("invalid_request");
      }
    });

    it("rejects with invalid_request when to is not the LinkVault", async () => {
      const mod = await import("@/lib/sponsor-server");
      const wrongTarget = "0x9999999999999999999999999999999999999999" as Address;
      const result = await mod.relaySponsoredClaim({
        request: { ...makeRequest(), to: wrongTarget },
        clientIp: "1.2.3.4",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("invalid_request");
        if (result.reason === "invalid_request") {
          expect(result.message).toMatch(/LinkVault/i);
        }
      }
    });

    it("rejects with invalid_request when selector is not claim()", async () => {
      const mod = await import("@/lib/sponsor-server");
      // Use a different function selector — deposit() = 0xd0e30db0
      // Pad to a length that won't decode as claim (random bytes).
      const wrongSelectorData = ("0xd0e30db0" + "00".repeat(64 * 5)) as Hex;
      const result = await mod.relaySponsoredClaim({
        request: { ...makeRequest(), data: wrongSelectorData },
        clientIp: "1.2.3.4",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Allowlist check happens AFTER decodeClaimCalldata. Non-claim
        // calldata will fail decode with "Expected claim", which we surface
        // as invalid_request.
        expect(result.reason).toBe("invalid_request");
      }
    });

    it("rejects with invalid_request when data cannot be decoded as claim()", async () => {
      const mod = await import("@/lib/sponsor-server");
      // Truncated data: selector is right but no args
      const badData = "0xf7121490" as Hex;
      const result = await mod.relaySponsoredClaim({
        request: { ...makeRequest(), data: badData },
        clientIp: "1.2.3.4",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("invalid_request");
      }
    });
  });

  describe("relaySponsoredClaim - budget enforcement", () => {
    it("rejects with budget_exhausted after draining the daily budget", async () => {
      // Set a small budget so we can drain it with a few relays.
      // Each relay books gas (500_000) * 1 gwei = 5e14 wei = 0.0005 MON.
      // With budget 0.001 MON, we can fit 2 successful relays before drain.
      process.env.GAS_SPONSOR_DAILY_BUDGET_MON = "0.001";
      vi.resetModules();
      const mod = await import("@/lib/sponsor-server");
      mod._resetBudgetForTest();
      mockWriteContract.mockResolvedValue("0x" + "aa".repeat(32));

      // Drain the budget with 2 successful relays (varying IP + recipient
      // + depositId to dodge rate limits).
      for (let i = 1; i <= 2; i++) {
        const r = await mod.relaySponsoredClaim({
          request: makeRequest({
            data: makeClaimData(
              BigInt(i),
              `0x${i.toString(16).padStart(40, "0")}` as Address,
            ),
          }),
          clientIp: `77.0.0.${i}`,
        });
        expect(r.ok).toBe(true);
      }

      // Budget should now be 0 (or very close).
      expect(mod.getRemainingBudgetMon()).toBeLessThan(0.0001);

      // Third relay must be budget_exhausted, NOT relay_failed.
      const result = await mod.relaySponsoredClaim({
        request: makeRequest({
          data: makeClaimData(
            99n,
            "0x4444444444444444444444444444444444444444" as Address,
          ),
        }),
        clientIp: "77.0.0.99",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("budget_exhausted");
        if (result.reason === "budget_exhausted") {
          expect(result.retryAfterSeconds).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("relaySponsoredClaim - rate limiting", () => {
    it("rate-limits after PER_IP_PER_MINUTE (5) requests from same IP", async () => {
      // Use a fresh IP per test run to avoid collision with other tests
      const ip = "10.0.0." + Math.floor(Math.random() * 250 + 1);
      const mod = await import("@/lib/sponsor-server");
      mod._resetBudgetForTest();

      // Mock writeContract to "succeed" so we exercise the full path
      mockWriteContract.mockResolvedValue("0x" + "ab".repeat(32));

      // Send 5 requests (limit is 5) — vary BOTH depositId AND recipient
      // so neither per-deposit (1) nor per-recipient (3/hour) limiters
      // trip before the per-IP (5/minute) limiter does.
      for (let i = 1; i <= 5; i++) {
        const r = await mod.relaySponsoredClaim({
          request: makeRequest({
            data: makeClaimData(
              BigInt(i),
              `0x${i.toString(16).padStart(40, "0")}` as Address,
            ),
          }),
          clientIp: ip,
        });
        expect(r.ok).toBe(true);
      }

      // 6th should be rate-limited by IP limiter
      const result = await mod.relaySponsoredClaim({
        request: makeRequest({
          data: makeClaimData(
            999n,
            "0x9999999999999999999999999999999999999999" as Address,
          ),
        }),
        clientIp: ip,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("rate_limited");
      }
    });

    it("rate-limits when the same depositId is relayed twice", async () => {
      const ip1 = "11.0.0." + Math.floor(Math.random() * 250 + 1);
      const ip2 = "11.0.0." + Math.floor(Math.random() * 250 + 1);
      const mod = await import("@/lib/sponsor-server");
      mod._resetBudgetForTest();
      mockWriteContract.mockResolvedValue("0x" + "cd".repeat(32));

      // First attempt from ip1 — succeeds, per-deposit counter increments.
      const r1 = await mod.relaySponsoredClaim({
        request: makeRequest(),
        clientIp: ip1,
      });
      expect(r1.ok).toBe(true);

      // Second attempt from a DIFFERENT IP, but same depositId — must be
      // rate-limited per the per-deposit rule (limit = 1).
      const r2 = await mod.relaySponsoredClaim({
        request: makeRequest(),
        clientIp: ip2,
      });
      expect(r2.ok).toBe(false);
      if (!r2.ok) {
        expect(r2.reason).toBe("rate_limited");
      }
    });
  });

  describe("relaySponsoredClaim - success and failure paths", () => {
    it("returns ok:true with txHash when writeContract succeeds", async () => {
      const mod = await import("@/lib/sponsor-server");
      mod._resetBudgetForTest();
      const FAKE_HASH = "0x" + "ab".repeat(32) as Hex;
      mockWriteContract.mockResolvedValue(FAKE_HASH);

      const result = await mod.relaySponsoredClaim({
        request: makeRequest(),
        clientIp: "12.34.56.78",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.txHash).toBe(FAKE_HASH);
      }
      // Verify writeContract was actually called with the expected args
      expect(mockWriteContract).toHaveBeenCalledTimes(1);
      const call = mockWriteContract.mock.calls[0]?.[0] as {
        address: Address;
        functionName: string;
      };
      expect(call.address).toBe(VALID_FORWARDER);
      expect(call.functionName).toBe("execute");
    });

    it("returns relay_failed when writeContract throws", async () => {
      const mod = await import("@/lib/sponsor-server");
      mod._resetBudgetForTest();
      mockWriteContract.mockRejectedValue(
        new Error("RPC connection refused"),
      );

      const result = await mod.relaySponsoredClaim({
        request: makeRequest(),
        clientIp: "12.34.56.79",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("relay_failed");
        if (result.reason === "relay_failed") {
          expect(result.message).toMatch(/RPC connection refused/);
        }
      }
    });

    it("decrements remaining budget after a successful relay", async () => {
      const mod = await import("@/lib/sponsor-server");
      mod._resetBudgetForTest();
      mockWriteContract.mockResolvedValue("0x" + "ef".repeat(32));

      const before = mod.getRemainingBudgetMon();
      await mod.relaySponsoredClaim({
        request: makeRequest(),
        clientIp: "12.34.56.80",
      });
      const after = mod.getRemainingBudgetMon();

      // Estimated cost is gas (500_000) * 1 gwei = 5e14 wei = 0.0005 MON
      // So budget should drop by approximately 0.0005 MON.
      expect(before - after).toBeCloseTo(0.0005, 5);
    });
  });
});
