import { describe, it, expect } from "vitest";
import {
  monadChain,
  LINK_VAULT_ADDRESS,
  isContractDeployed,
  SUPPORTED_TOKENS,
  EXPIRY_PRESETS,
} from "@/config/chain";

describe("chain config", () => {
  describe("monadChain", () => {
    it("should have correct chain ID", () => {
      expect(monadChain.id).toBe(10143);
    });

    it("should have correct name", () => {
      expect(monadChain.name).toBe("Monad Testnet");
    });

    it("should have MON as native currency", () => {
      expect(monadChain.nativeCurrency.symbol).toBe("MON");
      expect(monadChain.nativeCurrency.decimals).toBe(18);
    });

    it("should have correct RPC URL", () => {
      expect(monadChain.rpcUrls.default.http).toContain(
        "https://testnet-rpc.monad.xyz",
      );
    });

    it("should be marked as testnet", () => {
      expect(monadChain.testnet).toBe(true);
    });

    it("should have block explorer", () => {
      expect(monadChain.blockExplorers.default.url).toBe(
        "https://testnet.monadscan.com",
      );
    });
  });

  describe("LINK_VAULT_ADDRESS", () => {
    it("should be a valid hex address", () => {
      expect(LINK_VAULT_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it("should fall back to zero address when env var is missing", () => {
      // In test environment, NEXT_PUBLIC_LINK_VAULT_ADDRESS is not set.
      // The validator should fall back to zero address (treated as "not deployed")
      // rather than crashing or passing through garbage.
      expect(LINK_VAULT_ADDRESS).toBe(
        "0x0000000000000000000000000000000000000000",
      );
    });

    it("isContractDeployed should be false when address is zero", () => {
      expect(isContractDeployed).toBe(false);
    });
  });

  describe("LINK_VAULT_ADDRESS — security: env var validation", () => {
    // SECURITY: If a deployer typos the address in .env.local, transactions
    // would be sent to a random EOA (funds lost) or non-existent contract.
    // The validator must sanitize invalid env values back to zero address.
    //
    // We can't easily test this by changing process.env at runtime because
    // the module is already imported. Instead we verify the exported values
    // are always in a safe state regardless of how env was set.
    //
    // These tests document the contract: LINK_VAULT_ADDRESS is ALWAYS either
    // a valid 0x address or the zero address. Never raw garbage.

    it("LINK_VAULT_ADDRESS is always a valid 0x-prefixed 40-hex string", () => {
      expect(LINK_VAULT_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it("isContractDeployed is a boolean", () => {
      expect(typeof isContractDeployed).toBe("boolean");
    });

    it("LINK_VAULT_ADDRESS and isContractDeployed are consistent", () => {
      const isZero =
        LINK_VAULT_ADDRESS === "0x0000000000000000000000000000000000000000";
      expect(isContractDeployed).toBe(!isZero);
    });
  });

  describe("isContractDeployed", () => {
    it("should be false when address is zero (no env set)", () => {
      // In test environment, NEXT_PUBLIC_LINK_VAULT_ADDRESS is not set
      // So it defaults to zero address
      expect(isContractDeployed).toBe(false);
    });
  });

  describe("SUPPORTED_TOKENS", () => {
    it("should include at least MON native token", () => {
      expect(SUPPORTED_TOKENS.length).toBeGreaterThanOrEqual(1);
    });

    it("should have MON as first token", () => {
      expect(SUPPORTED_TOKENS[0].symbol).toBe("MON");
      expect(SUPPORTED_TOKENS[0].isNative).toBe(true);
    });

    it("should have correct MON address (zero address)", () => {
      expect(SUPPORTED_TOKENS[0].address).toBe(
        "0x0000000000000000000000000000000000000000",
      );
    });

    it("should have 18 decimals for MON", () => {
      expect(SUPPORTED_TOKENS[0].decimals).toBe(18);
    });
  });

  describe("EXPIRY_PRESETS", () => {
    it("should have 5 presets", () => {
      expect(EXPIRY_PRESETS).toHaveLength(5);
    });

    it("should have correct labels", () => {
      const labels = EXPIRY_PRESETS.map((p) => p.label);
      expect(labels).toEqual(["1 hour", "6 hours", "24 hours", "3 days", "7 days"]);
    });

    it("should have correct values in seconds", () => {
      const values = EXPIRY_PRESETS.map((p) => p.value);
      expect(values).toEqual([3600, 21600, 86400, 259200, 604800]);
    });

    it("should have values in ascending order", () => {
      for (let i = 1; i < EXPIRY_PRESETS.length; i++) {
        expect(EXPIRY_PRESETS[i].value).toBeGreaterThan(
          EXPIRY_PRESETS[i - 1].value,
        );
      }
    });
  });
});
