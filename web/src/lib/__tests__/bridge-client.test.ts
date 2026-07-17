import { describe, it, expect } from "vitest";
import {
  SOURCE_CHAINS,
  MONAD_DESTINATION_CHAIN_ID,
} from "@/lib/bridge-client";

describe("bridge-client", () => {
  describe("SOURCE_CHAINS", () => {
    it("should include all 7 major chains", () => {
      expect(SOURCE_CHAINS.length).toBe(7);
    });

    it("should have id, name, shortName for each", () => {
      for (const chain of SOURCE_CHAINS) {
        expect(typeof chain.id).toBe("number");
        expect(chain.id).toBeGreaterThan(0);
        expect(chain.name.length).toBeGreaterThan(0);
        expect(chain.shortName.length).toBeGreaterThan(0);
      }
    });

    it("should not contain any API keys (security check)", () => {
      const serialized = JSON.stringify(SOURCE_CHAINS);
      expect(serialized).not.toMatch(/api[_-]?key/i);
      expect(serialized).not.toMatch(/alchemy/i);
      expect(serialized).not.toMatch(/secret/i);
    });
  });

  describe("MONAD_DESTINATION_CHAIN_ID", () => {
    it("should be a number", () => {
      expect(typeof MONAD_DESTINATION_CHAIN_ID).toBe("number");
    });

    it("should be either 143 or 10143", () => {
      expect([143, 10143]).toContain(MONAD_DESTINATION_CHAIN_ID);
    });
  });
});
