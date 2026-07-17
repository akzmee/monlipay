import { describe, it, expect } from "vitest";
import {
  extractCostUSD,
  extractCostAmount,
  normalizeStatus,
  isTerminalStatus,
} from "@/lib/lifi-parse";

describe("lifi-parse", () => {
  describe("extractCostUSD", () => {
    it("should sum USD amounts from an array of cost objects", () => {
      const costs = [
        { amount: "1000", amountUSD: "1.50", type: "gas" },
        { amount: "500", amountUSD: "0.75", type: "fee" },
      ];
      // 1.50 + 0.75 = 2.25
      expect(extractCostUSD(costs)).toBe("2.250000");
    });

    it("should handle a single-element array", () => {
      const costs = [{ amount: "1000", amountUSD: "5.00" }];
      expect(extractCostUSD(costs)).toBe("5.000000");
    });

    it("should return fallback for empty array", () => {
      expect(extractCostUSD([])).toBe("0");
      expect(extractCostUSD([], "N/A")).toBe("N/A");
    });

    it("should handle string input (legacy LI.FI format)", () => {
      expect(extractCostUSD("3.14")).toBe("3.14");
    });

    it("should return fallback for non-array, non-string input", () => {
      expect(extractCostUSD(null)).toBe("0");
      expect(extractCostUSD(undefined)).toBe("0");
      expect(extractCostUSD({})).toBe("0");
      expect(extractCostUSD(123)).toBe("0");
    });

    it("should skip entries with missing or invalid amountUSD", () => {
      const costs = [
        { amount: "1000", amountUSD: "1.00" },
        { amount: "500" }, // missing amountUSD
        { amount: "200", amountUSD: "abc" }, // invalid
      ];
      expect(extractCostUSD(costs)).toBe("1.000000");
    });

    it("should return fallback when all entries have invalid amountUSD", () => {
      const costs = [{ amountUSD: "abc" }, { foo: "bar" }];
      expect(extractCostUSD(costs)).toBe("0");
    });

    it("should handle zero USD amounts", () => {
      const costs = [{ amount: "0", amountUSD: "0" }];
      expect(extractCostUSD(costs)).toBe("0.000000");
    });
  });

  describe("extractCostAmount", () => {
    it("should sum native amounts from an array using BigInt", () => {
      const costs = [
        { amount: "1000000000000000000" },
        { amount: "500000000000000000" },
      ];
      expect(extractCostAmount(costs)).toBe("1500000000000000000");
    });

    it("should handle a single-element array", () => {
      const costs = [{ amount: "42" }];
      expect(extractCostAmount(costs)).toBe("42");
    });

    it("should return fallback for empty array", () => {
      expect(extractCostAmount([])).toBe("0");
      expect(extractCostAmount([], "fallback")).toBe("fallback");
    });

    it("should handle string input", () => {
      expect(extractCostAmount("999")).toBe("999");
    });

    it("should skip entries with unparseable amounts", () => {
      const costs = [
        { amount: "100" },
        { amount: "not-a-number" },
        { amount: "200" },
      ];
      expect(extractCostAmount(costs)).toBe("300");
    });

    it("should return fallback for non-array input", () => {
      expect(extractCostAmount(null)).toBe("0");
      expect(extractCostAmount(undefined)).toBe("0");
      expect(extractCostAmount({})).toBe("0");
    });
  });

  describe("normalizeStatus", () => {
    it("should normalize uppercase LI.FI statuses to lowercase", () => {
      expect(normalizeStatus("DONE")).toBe("done");
      expect(normalizeStatus("PENDING")).toBe("pending");
      expect(normalizeStatus("FAILED")).toBe("failed");
      expect(normalizeStatus("REFUNDED")).toBe("refunded");
      expect(normalizeStatus("WAITING")).toBe("waiting");
      expect(normalizeStatus("NOT_STARTED")).toBe("not_started");
      expect(normalizeStatus("UNKNOWN")).toBe("unknown");
      expect(normalizeStatus("NOT_FOUND")).toBe("unknown");
    });

    it("should pass through lowercase statuses", () => {
      expect(normalizeStatus("done")).toBe("done");
      expect(normalizeStatus("pending")).toBe("pending");
      expect(normalizeStatus("failed")).toBe("failed");
      expect(normalizeStatus("refunded")).toBe("refunded");
    });

    it("should handle WAITING_FOR_* variants", () => {
      expect(normalizeStatus("WAITING_FOR_CONFIRMATION")).toBe("waiting");
      expect(normalizeStatus("WAITING_FOR_RECEIVING_TRANSACTION")).toBe(
        "waiting",
      );
      expect(normalizeStatus("waiting_for_confirmation")).toBe("waiting");
    });

    it("should handle completed as done", () => {
      expect(normalizeStatus("COMPLETED")).toBe("done");
      expect(normalizeStatus("completed")).toBe("done");
    });

    it("should return unknown for unrecognized status strings", () => {
      expect(normalizeStatus("SOMETHING_NEW")).toBe("unknown");
      expect(normalizeStatus("foobar")).toBe("unknown");
    });

    it("should return unknown for non-string input", () => {
      expect(normalizeStatus(null)).toBe("unknown");
      expect(normalizeStatus(undefined)).toBe("unknown");
      expect(normalizeStatus(123)).toBe("unknown");
      expect(normalizeStatus({})).toBe("unknown");
    });

    it("should return unknown for null string", () => {
      expect(normalizeStatus("null")).toBe("unknown");
    });
  });

  describe("isTerminalStatus", () => {
    it("should return true for terminal statuses", () => {
      expect(isTerminalStatus("done")).toBe(true);
      expect(isTerminalStatus("failed")).toBe(true);
      expect(isTerminalStatus("refunded")).toBe(true);
    });

    it("should return false for non-terminal statuses", () => {
      expect(isTerminalStatus("pending")).toBe(false);
      expect(isTerminalStatus("waiting")).toBe(false);
      expect(isTerminalStatus("not_started")).toBe(false);
      expect(isTerminalStatus("unknown")).toBe(false);
    });
  });
});
