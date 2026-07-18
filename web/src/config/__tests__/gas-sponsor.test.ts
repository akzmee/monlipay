import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Tests for gas-sponsor.ts configuration.
 *
 * This module reads env vars at module-load time. To test different
 * configurations, we manipulate process.env and use vi.resetModules()
 * to force re-importing the module — same pattern as bridge-server.test.ts.
 */

const VALID_FORWARDER = "0x1234567890123456789012345678901234567890";
const VALID_PRIVATE_KEY =
  "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";

describe("gas-sponsor config", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  describe("defaults (no env vars set)", () => {
    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_GAS_SPONSOR_ENABLED;
      delete process.env.NEXT_PUBLIC_GAS_FORWARDER_ADDRESS;
      delete process.env.GAS_SPONSOR_PRIVATE_KEY;
      delete process.env.GAS_SPONSOR_DAILY_BUDGET_MON;
      vi.resetModules();
    });

    it("should have GAS_SPONSOR_ENABLED = false", async () => {
      const mod = await import("@/config/gas-sponsor");
      expect(mod.GAS_SPONSOR_ENABLED).toBe(false);
    });

    it("should default GAS_FORWARDER_ADDRESS to zero address", async () => {
      const mod = await import("@/config/gas-sponsor");
      expect(mod.GAS_FORWARDER_ADDRESS).toBe(
        "0x0000000000000000000000000000000000000000",
      );
    });

    it("should have isGasSponsorAvailable = false", async () => {
      const mod = await import("@/config/gas-sponsor");
      expect(mod.isGasSponsorAvailable).toBe(false);
    });

    it("should have empty GAS_SPONSOR_PRIVATE_KEY", async () => {
      const mod = await import("@/config/gas-sponsor");
      expect(mod.GAS_SPONSOR_PRIVATE_KEY).toBe("");
    });

    it("should default GAS_SPONSOR_DAILY_BUDGET_MON to 0.5", async () => {
      const mod = await import("@/config/gas-sponsor");
      expect(mod.GAS_SPONSOR_DAILY_BUDGET_MON).toBe(0.5);
    });

    it("should have isSponsorServerConfigured = false", async () => {
      const mod = await import("@/config/gas-sponsor");
      expect(mod.isSponsorServerConfigured).toBe(false);
    });
  });

  describe("client-side availability (isGasSponsorAvailable)", () => {
    it("should be true when enabled + valid forwarder set", async () => {
      process.env.NEXT_PUBLIC_GAS_SPONSOR_ENABLED = "true";
      process.env.NEXT_PUBLIC_GAS_FORWARDER_ADDRESS = VALID_FORWARDER;
      vi.resetModules();
      const mod = await import("@/config/gas-sponsor");
      expect(mod.isGasSponsorAvailable).toBe(true);
    });

    it("should be false when enabled but no forwarder set", async () => {
      process.env.NEXT_PUBLIC_GAS_SPONSOR_ENABLED = "true";
      delete process.env.NEXT_PUBLIC_GAS_FORWARDER_ADDRESS;
      vi.resetModules();
      const mod = await import("@/config/gas-sponsor");
      expect(mod.isGasSponsorAvailable).toBe(false);
    });

    it("should be false when enabled but forwarder is zero address", async () => {
      process.env.NEXT_PUBLIC_GAS_SPONSOR_ENABLED = "true";
      process.env.NEXT_PUBLIC_GAS_FORWARDER_ADDRESS =
        "0x0000000000000000000000000000000000000000";
      vi.resetModules();
      const mod = await import("@/config/gas-sponsor");
      expect(mod.isGasSponsorAvailable).toBe(false);
    });

    it("should be false when disabled even with valid forwarder", async () => {
      process.env.NEXT_PUBLIC_GAS_SPONSOR_ENABLED = "false";
      process.env.NEXT_PUBLIC_GAS_FORWARDER_ADDRESS = VALID_FORWARDER;
      vi.resetModules();
      const mod = await import("@/config/gas-sponsor");
      expect(mod.isGasSponsorAvailable).toBe(false);
    });

    it("should be false when NEXT_PUBLIC_GAS_SPONSOR_ENABLED is not 'true'", async () => {
      process.env.NEXT_PUBLIC_GAS_SPONSOR_ENABLED = "1";
      process.env.NEXT_PUBLIC_GAS_FORWARDER_ADDRESS = VALID_FORWARDER;
      vi.resetModules();
      const mod = await import("@/config/gas-sponsor");
      expect(mod.isGasSponsorAvailable).toBe(false);
    });

    it("should default to zero address when forwarder is invalid", async () => {
      process.env.NEXT_PUBLIC_GAS_SPONSOR_ENABLED = "true";
      process.env.NEXT_PUBLIC_GAS_FORWARDER_ADDRESS = "not-an-address";
      vi.resetModules();
      const mod = await import("@/config/gas-sponsor");
      // Falls back to zero address because the input is not a valid address
      expect(mod.GAS_FORWARDER_ADDRESS).toBe(
        "0x0000000000000000000000000000000000000000",
      );
      expect(mod.isGasSponsorAvailable).toBe(false);
    });
  });

  describe("server-side configuration (isSponsorServerConfigured)", () => {
    it("should be true when all four conditions are met", async () => {
      process.env.NEXT_PUBLIC_GAS_SPONSOR_ENABLED = "true";
      process.env.NEXT_PUBLIC_GAS_FORWARDER_ADDRESS = VALID_FORWARDER;
      process.env.GAS_SPONSOR_PRIVATE_KEY = VALID_PRIVATE_KEY;
      process.env.GAS_SPONSOR_DAILY_BUDGET_MON = "1.0";
      vi.resetModules();
      const mod = await import("@/config/gas-sponsor");
      expect(mod.isSponsorServerConfigured).toBe(true);
    });

    it("should be false when sponsor key is missing", async () => {
      process.env.NEXT_PUBLIC_GAS_SPONSOR_ENABLED = "true";
      process.env.NEXT_PUBLIC_GAS_FORWARDER_ADDRESS = VALID_FORWARDER;
      delete process.env.GAS_SPONSOR_PRIVATE_KEY;
      process.env.GAS_SPONSOR_DAILY_BUDGET_MON = "1.0";
      vi.resetModules();
      const mod = await import("@/config/gas-sponsor");
      expect(mod.isSponsorServerConfigured).toBe(false);
    });

    it("should be false when sponsor key is too short (not 66 chars)", async () => {
      process.env.NEXT_PUBLIC_GAS_SPONSOR_ENABLED = "true";
      process.env.NEXT_PUBLIC_GAS_FORWARDER_ADDRESS = VALID_FORWARDER;
      process.env.GAS_SPONSOR_PRIVATE_KEY = "0xabc";
      process.env.GAS_SPONSOR_DAILY_BUDGET_MON = "1.0";
      vi.resetModules();
      const mod = await import("@/config/gas-sponsor");
      expect(mod.isSponsorServerConfigured).toBe(false);
    });

    it("should be false when daily budget is zero", async () => {
      process.env.NEXT_PUBLIC_GAS_SPONSOR_ENABLED = "true";
      process.env.NEXT_PUBLIC_GAS_FORWARDER_ADDRESS = VALID_FORWARDER;
      process.env.GAS_SPONSOR_PRIVATE_KEY = VALID_PRIVATE_KEY;
      process.env.GAS_SPONSOR_DAILY_BUDGET_MON = "0";
      vi.resetModules();
      const mod = await import("@/config/gas-sponsor");
      expect(mod.isSponsorServerConfigured).toBe(false);
    });

    it("should be false when daily budget is negative", async () => {
      process.env.NEXT_PUBLIC_GAS_SPONSOR_ENABLED = "true";
      process.env.NEXT_PUBLIC_GAS_FORWARDER_ADDRESS = VALID_FORWARDER;
      process.env.GAS_SPONSOR_PRIVATE_KEY = VALID_PRIVATE_KEY;
      process.env.GAS_SPONSOR_DAILY_BUDGET_MON = "-1";
      vi.resetModules();
      const mod = await import("@/config/gas-sponsor");
      expect(mod.isSponsorServerConfigured).toBe(false);
      // When the parsed budget is invalid, the value is 0
      expect(mod.GAS_SPONSOR_DAILY_BUDGET_MON).toBe(0);
    });

    it("should be false when daily budget is non-numeric", async () => {
      process.env.NEXT_PUBLIC_GAS_SPONSOR_ENABLED = "true";
      process.env.NEXT_PUBLIC_GAS_FORWARDER_ADDRESS = VALID_FORWARDER;
      process.env.GAS_SPONSOR_PRIVATE_KEY = VALID_PRIVATE_KEY;
      process.env.GAS_SPONSOR_DAILY_BUDGET_MON = "not-a-number";
      vi.resetModules();
      const mod = await import("@/config/gas-sponsor");
      expect(mod.isSponsorServerConfigured).toBe(false);
      expect(mod.GAS_SPONSOR_DAILY_BUDGET_MON).toBe(0);
    });
  });

  describe("SPONSOR_RATE_LIMITS", () => {
    it("should expose constant rate limit values", async () => {
      vi.resetModules();
      const mod = await import("@/config/gas-sponsor");
      expect(mod.SPONSOR_RATE_LIMITS.PER_IP_PER_MINUTE).toBe(5);
      expect(mod.SPONSOR_RATE_LIMITS.PER_RECIPIENT_PER_HOUR).toBe(3);
      expect(mod.SPONSOR_RATE_LIMITS.PER_DEPOSIT).toBe(1);
    });
  });
});
