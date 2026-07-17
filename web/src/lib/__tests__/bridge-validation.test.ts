import { describe, it, expect } from "vitest";
import {
  isValidAddress,
  isValidChainId,
  isValidAmount,
  isValidTxHash,
  isValidBridgeName,
  errorResponse,
  successResponse,
  MAX_AMOUNT,
  ERRORS,
} from "@/lib/bridge-validation";

describe("bridge-validation", () => {
  describe("isValidAddress", () => {
    it("should accept valid Ethereum addresses", () => {
      expect(
        isValidAddress("0x1234567890123456789012345678901234567890"),
      ).toBe(true);
      expect(
        isValidAddress("0xabcdefABCDEFabcdefabcdefabcdefabcdefABCD"),
      ).toBe(true);
    });

    it("should reject addresses without 0x prefix", () => {
      expect(
        isValidAddress("1234567890123456789012345678901234567890" as string),
      ).toBe(false);
    });

    it("should reject addresses with wrong length", () => {
      expect(
        isValidAddress("0x123456789012345678901234567890123456789" as string),
      ).toBe(false); // 39 chars
      expect(
        isValidAddress(
          "0x12345678901234567890123456789012345678901" as string,
        ),
      ).toBe(false); // 41 chars
    });

    it("should reject addresses with invalid hex", () => {
      expect(
        isValidAddress("0x123456789012345678901234567890123456789g" as string),
      ).toBe(false);
    });

    it("should reject empty strings", () => {
      expect(isValidAddress("" as string)).toBe(false);
    });

    it("should reject non-string types", () => {
      expect(isValidAddress(null as unknown as string)).toBe(false);
      expect(isValidAddress(undefined as unknown as string)).toBe(false);
      expect(isValidAddress(123 as unknown as string)).toBe(false);
    });

    it("zero address has valid format — intentional", () => {
      expect(
        isValidAddress("0x0000000000000000000000000000000000000000"),
      ).toBe(true);
    });
  });

  describe("isValidChainId", () => {
    it("should accept positive integers", () => {
      expect(isValidChainId(1)).toBe(true);
      expect(isValidChainId(143)).toBe(true);
      expect(isValidChainId(10143)).toBe(true);
      expect(isValidChainId(42161)).toBe(true);
    });

    it("should reject zero", () => {
      expect(isValidChainId(0)).toBe(false);
    });

    it("should reject negative numbers", () => {
      expect(isValidChainId(-1)).toBe(false);
    });

    it("should reject non-integers", () => {
      expect(isValidChainId(1.5)).toBe(false);
    });

    it("should reject non-numbers", () => {
      expect(isValidChainId("1")).toBe(false);
      expect(isValidChainId(null)).toBe(false);
      expect(isValidChainId(undefined)).toBe(false);
      expect(isValidChainId(NaN)).toBe(false);
    });

    it("should reject unreasonably large IDs", () => {
      expect(isValidChainId(1000000)).toBe(false);
    });
  });

  describe("isValidAmount", () => {
    it("should accept positive integer strings", () => {
      expect(isValidAmount("1")).toBe(true);
      expect(isValidAmount("1000000000000000000")).toBe(true);
      expect(isValidAmount("999999999999")).toBe(true);
    });

    it("should reject zero", () => {
      expect(isValidAmount("0")).toBe(false);
    });

    it("should reject negative numbers", () => {
      expect(isValidAmount("-1")).toBe(false);
    });

    it("should reject decimal numbers", () => {
      expect(isValidAmount("1.5")).toBe(false);
      expect(isValidAmount("0.1")).toBe(false);
    });

    it("should reject non-numeric strings", () => {
      expect(isValidAmount("abc")).toBe(false);
      expect(isValidAmount("")).toBe(false);
      expect(isValidAmount("1e18")).toBe(false);
    });

    it("should reject values exceeding MAX_AMOUNT (upper bound check)", () => {
      // MAX_AMOUNT is 10^36. Create a value larger than that.
      const tooBig = (BigInt(MAX_AMOUNT) + 1n).toString();
      expect(isValidAmount(tooBig)).toBe(false);
    });

    it("should accept exactly MAX_AMOUNT", () => {
      expect(isValidAmount(MAX_AMOUNT)).toBe(true);
    });

    it("should reject non-string types", () => {
      expect(isValidAmount(null as unknown as string)).toBe(false);
      expect(isValidAmount(undefined as unknown as string)).toBe(false);
      expect(isValidAmount(123 as unknown as string)).toBe(false);
    });

    it("leading zeros are technically valid (BigInt accepts)", () => {
      expect(isValidAmount("01")).toBe(true);
    });
  });

  describe("isValidTxHash", () => {
    it("should accept valid transaction hashes", () => {
      expect(
        isValidTxHash(
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        ),
      ).toBe(true);
    });

    it("should reject hashes without 0x prefix", () => {
      expect(
        isValidTxHash(
          "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        ),
      ).toBe(false);
    });

    it("should reject hashes with wrong length", () => {
      expect(isValidTxHash("0x1234567890abcdef")).toBe(false); // too short
    });

    it("should reject hashes with invalid hex", () => {
      expect(
        isValidTxHash(
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdeg",
        ),
      ).toBe(false);
    });

    it("should reject empty strings", () => {
      expect(isValidTxHash("")).toBe(false);
    });
  });

  describe("isValidBridgeName", () => {
    it("should accept valid bridge names", () => {
      expect(isValidBridgeName("deBridge")).toBe(true);
      expect(isValidBridgeName("across")).toBe(true);
      expect(isValidBridgeName("stargate-v2")).toBe(true);
      expect(isValidBridgeName("hop_protocol")).toBe(true);
      expect(isValidBridgeName("ABC123")).toBe(true);
    });

    it("should reject empty strings", () => {
      expect(isValidBridgeName("")).toBe(false);
    });

    it("should reject names with special chars (URL injection prevention)", () => {
      expect(isValidBridgeName("deBridge?inject=true")).toBe(false);
      expect(isValidBridgeName("foo&bar=baz")).toBe(false);
      expect(isValidBridgeName("foo bar")).toBe(false); // space
      expect(isValidBridgeName("foo/bar")).toBe(false);
      expect(isValidBridgeName("<script>")).toBe(false);
    });

    it("should reject names longer than 64 chars", () => {
      expect(isValidBridgeName("a".repeat(65))).toBe(false);
      expect(isValidBridgeName("a".repeat(64))).toBe(true);
    });

    it("should reject non-string types", () => {
      expect(isValidBridgeName(null as unknown as string)).toBe(false);
      expect(isValidBridgeName(undefined as unknown as string)).toBe(false);
    });
  });

  describe("errorResponse", () => {
    it("should create a JSON error response with correct status", async () => {
      const res = errorResponse(
        { error: "Bad request", code: "BAD" },
        400,
      );
      expect(res.status).toBe(400);
      expect(res.headers.get("Content-Type")).toBe("application/json");
      const body = (await res.json()) as { error: string; code: string };
      expect(body.error).toBe("Bad request");
      expect(body.code).toBe("BAD");
    });

    it("should default to 400 status", () => {
      const res = errorResponse({ error: "X", code: "X" });
      expect(res.status).toBe(400);
    });
  });

  describe("successResponse", () => {
    it("should create a JSON success response with no-store cache", async () => {
      const res = successResponse({ ok: true });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/json");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);
    });

    it("should support custom status codes", () => {
      const res = successResponse({}, 201);
      expect(res.status).toBe(201);
    });
  });

  describe("ERRORS constant", () => {
    it("should have all expected error codes", () => {
      expect(ERRORS.MISSING_API_KEY.code).toBe("MISSING_API_KEY");
      expect(ERRORS.MISSING_ALCHEMY_KEY.code).toBe("MISSING_ALCHEMY_KEY");
      expect(ERRORS.INVALID_ADDRESS.code).toBe("INVALID_ADDRESS");
      expect(ERRORS.INVALID_CHAIN.code).toBe("INVALID_CHAIN_ID");
      expect(ERRORS.INVALID_AMOUNT.code).toBe("INVALID_AMOUNT");
      expect(ERRORS.INVALID_TX_HASH.code).toBe("INVALID_TX_HASH");
      expect(ERRORS.INVALID_BRIDGE_NAME.code).toBe("INVALID_BRIDGE_NAME");
      expect(ERRORS.INVALID_DEST_CHAIN.code).toBe("INVALID_DEST_CHAIN");
      expect(ERRORS.RATE_LIMITED.code).toBe("RATE_LIMITED");
    });

    it("all errors should have non-empty messages", () => {
      for (const key of Object.keys(ERRORS)) {
        const err = ERRORS[key as keyof typeof ERRORS];
        expect(err.error.length).toBeGreaterThan(0);
        expect(err.code.length).toBeGreaterThan(0);
      }
    });
  });
});
