import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Tests for bridge-server.ts.
 *
 * This module reads env vars at module-load time. To test different
 * configurations, we manipulate process.env and use vi.resetModules()
 * to force re-importing the module.
 */

describe("bridge-server", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("with no API keys set", () => {
    beforeEach(() => {
      delete process.env.LIFI_API_KEY;
      delete process.env.ALCHEMY_API_KEY;
      vi.resetModules();
    });

    it("should report LI.FI as not configured", async () => {
      const mod = await import("@/lib/bridge-server");
      expect(mod.isLifiConfigured).toBe(false);
      expect(mod.LIFI_API_KEY).toBe("");
    });

    it("should report Alchemy as not configured", async () => {
      const mod = await import("@/lib/bridge-server");
      expect(mod.isAlchemyConfigured).toBe(false);
      expect(mod.ALCHEMY_API_KEY).toBe("");
    });
  });

  describe("with valid API keys set", () => {
    beforeEach(() => {
      process.env.LIFI_API_KEY = "lifi-real-key-1234567890";
      process.env.ALCHEMY_API_KEY = "alchemy-real-key-1234567890";
      vi.resetModules();
    });

    it("should report LI.FI as configured", async () => {
      const mod = await import("@/lib/bridge-server");
      expect(mod.isLifiConfigured).toBe(true);
      expect(mod.LIFI_API_KEY).toBe("lifi-real-key-1234567890");
    });

    it("should report Alchemy as configured", async () => {
      const mod = await import("@/lib/bridge-server");
      expect(mod.isAlchemyConfigured).toBe(true);
      expect(mod.ALCHEMY_API_KEY).toBe("alchemy-real-key-1234567890");
    });

    it("should trim whitespace from keys", async () => {
      process.env.LIFI_API_KEY = "  lifi-real-key-1234567890  ";
      vi.resetModules();
      const mod = await import("@/lib/bridge-server");
      expect(mod.LIFI_API_KEY).toBe("lifi-real-key-1234567890");
    });
  });

  describe("with placeholder API keys", () => {
    const placeholders = [
      "your-lifi-api-key",
      "your-alchemy-api-key",
      "your_key_here",
      "your-key-here",
      "xxx",
      "changeme",
      "placeholder",
      "todo",
    ];

    for (const ph of placeholders) {
      it(`should reject placeholder value: "${ph}"`, async () => {
        process.env.LIFI_API_KEY = ph;
        vi.resetModules();
        const mod = await import("@/lib/bridge-server");
        expect(mod.isLifiConfigured).toBe(false);
        expect(mod.LIFI_API_KEY).toBe("");
      });
    }

    it("should reject placeholder regardless of case", async () => {
      process.env.LIFI_API_KEY = "YOUR-LIFI-API-KEY";
      vi.resetModules();
      const mod = await import("@/lib/bridge-server");
      expect(mod.isLifiConfigured).toBe(false);
    });

    it("should reject keys shorter than 8 chars", async () => {
      process.env.LIFI_API_KEY = "short";
      vi.resetModules();
      const mod = await import("@/lib/bridge-server");
      expect(mod.isLifiConfigured).toBe(false);
    });

    it("should reject keys containing whitespace", async () => {
      process.env.LIFI_API_KEY = "key with space";
      vi.resetModules();
      const mod = await import("@/lib/bridge-server");
      expect(mod.isLifiConfigured).toBe(false);
    });
  });

  describe("LIFI_BASE_URL", () => {
    it("should be the LI.FI v1 endpoint", async () => {
      vi.resetModules();
      const mod = await import("@/lib/bridge-server");
      expect(mod.LIFI_BASE_URL).toBe("https://li.quest/v1");
    });
  });

  describe("SOURCE_CHAINS", () => {
    it("should include all major source chains", async () => {
      vi.resetModules();
      const mod = await import("@/lib/bridge-server");
      const ids = mod.SOURCE_CHAINS.map((c) => c.id);
      expect(ids).toContain(1); // Ethereum
      expect(ids).toContain(10); // Optimism
      expect(ids).toContain(8453); // Base
      expect(ids).toContain(42161); // Arbitrum
      expect(ids).toContain(137); // Polygon
      expect(ids).toContain(56); // BNB
      expect(ids).toContain(43114); // Avalanche
    });

    it("should have name and shortName for each chain", async () => {
      vi.resetModules();
      const mod = await import("@/lib/bridge-server");
      for (const chain of mod.SOURCE_CHAINS) {
        expect(chain.name.length).toBeGreaterThan(0);
        expect(chain.shortName.length).toBeGreaterThan(0);
      }
    });
  });

  describe("MONAD_DESTINATION_CHAIN_ID", () => {
    it("should default to testnet (10143) when no env var set", async () => {
      delete process.env.NEXT_PUBLIC_NETWORK;
      vi.resetModules();
      const mod = await import("@/lib/bridge-server");
      expect(mod.MONAD_DESTINATION_CHAIN_ID).toBe(10143);
    });

    it("should be 143 when NEXT_PUBLIC_NETWORK=mainnet", async () => {
      process.env.NEXT_PUBLIC_NETWORK = "mainnet";
      vi.resetModules();
      const mod = await import("@/lib/bridge-server");
      expect(mod.MONAD_DESTINATION_CHAIN_ID).toBe(143);
    });

    it("should be 10143 when NEXT_PUBLIC_NETWORK=testnet", async () => {
      process.env.NEXT_PUBLIC_NETWORK = "testnet";
      vi.resetModules();
      const mod = await import("@/lib/bridge-server");
      expect(mod.MONAD_DESTINATION_CHAIN_ID).toBe(10143);
    });
  });

  describe("getAlchemyRpcUrl", () => {
    it("should return Alchemy URL when key is configured", async () => {
      process.env.ALCHEMY_API_KEY = "alchemy-real-key-1234567890";
      vi.resetModules();
      const mod = await import("@/lib/bridge-server");
      const url = mod.getAlchemyRpcUrl(1);
      expect(url).toContain("eth-mainnet");
      expect(url).toContain("alchemy-real-key-1234567890");
    });

    it("should return public RPC when Alchemy is not configured", async () => {
      delete process.env.ALCHEMY_API_KEY;
      vi.resetModules();
      const mod = await import("@/lib/bridge-server");
      const url = mod.getAlchemyRpcUrl(1);
      expect(url).toBe("https://eth.llamarpc.com");
    });

    it("should return public RPC for known chains without Alchemy", async () => {
      delete process.env.ALCHEMY_API_KEY;
      vi.resetModules();
      const mod = await import("@/lib/bridge-server");
      expect(mod.getAlchemyRpcUrl(10)).toBe("https://mainnet.optimism.io");
      expect(mod.getAlchemyRpcUrl(8453)).toBe("https://mainnet.base.org");
      expect(mod.getAlchemyRpcUrl(42161)).toBe("https://arb1.arbitrum.io/rpc");
      expect(mod.getAlchemyRpcUrl(137)).toBe("https://polygon-rpc.com");
      expect(mod.getAlchemyRpcUrl(56)).toBe(
        "https://bsc-dataseed.binance.org",
      );
      expect(mod.getAlchemyRpcUrl(43114)).toBe(
        "https://api.avax.network/ext/bc/C/rpc",
      );
    });

    it("should return empty string for unknown chain ID", async () => {
      delete process.env.ALCHEMY_API_KEY;
      vi.resetModules();
      const mod = await import("@/lib/bridge-server");
      expect(mod.getAlchemyRpcUrl(99999)).toBe("");
    });

    it("should handle all known chain IDs with Alchemy configured", async () => {
      process.env.ALCHEMY_API_KEY = "alchemy-real-key-1234567890";
      vi.resetModules();
      const mod = await import("@/lib/bridge-server");
      expect(mod.getAlchemyRpcUrl(1)).toContain("eth-mainnet");
      expect(mod.getAlchemyRpcUrl(10)).toContain("opt-mainnet");
      expect(mod.getAlchemyRpcUrl(8453)).toContain("base-mainnet");
      expect(mod.getAlchemyRpcUrl(42161)).toContain("arb-mainnet");
      expect(mod.getAlchemyRpcUrl(137)).toContain("polygon-mainnet");
      expect(mod.getAlchemyRpcUrl(56)).toContain("bnb-mainnet");
      expect(mod.getAlchemyRpcUrl(43114)).toContain("avax-mainnet");
    });
  });

  describe("_isValidApiKey (internal helper)", () => {
    it("should be exported for testing", async () => {
      vi.resetModules();
      const mod = await import("@/lib/bridge-server");
      expect(typeof mod._isValidApiKey).toBe("function");
    });
  });
});
