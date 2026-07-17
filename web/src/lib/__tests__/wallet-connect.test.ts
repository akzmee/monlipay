import { describe, it, expect } from "vitest";
import {
  isValidWalletConnectId,
  KNOWN_PLACEHOLDER_IDS,
} from "@/lib/wallet-connect";

describe("wallet-connect", () => {
  describe("KNOWN_PLACEHOLDER_IDS", () => {
    it("should include common placeholder values", () => {
      expect(KNOWN_PLACEHOLDER_IDS.has("")).toBe(true);
      expect(KNOWN_PLACEHOLDER_IDS.has("dummy")).toBe(true);
      expect(KNOWN_PLACEHOLDER_IDS.has("dummy-project-id")).toBe(true);
      expect(KNOWN_PLACEHOLDER_IDS.has("placeholder")).toBe(true);
      expect(KNOWN_PLACEHOLDER_IDS.has("your-project-id")).toBe(true);
      expect(KNOWN_PLACEHOLDER_IDS.has("xxx")).toBe(true);
      expect(KNOWN_PLACEHOLDER_IDS.has("changeme")).toBe(true);
      expect(KNOWN_PLACEHOLDER_IDS.has("todo")).toBe(true);
    });

    it("should not include real-looking hex IDs", () => {
      expect(KNOWN_PLACEHOLDER_IDS.has("abcdef1234567890")).toBe(false);
    });
  });

  describe("isValidWalletConnectId", () => {
    describe("rejection cases (placeholders)", () => {
      it("should reject empty string", () => {
        expect(isValidWalletConnectId("")).toBe(false);
      });

      it("should reject 'dummy'", () => {
        expect(isValidWalletConnectId("dummy")).toBe(false);
      });

      it("should reject 'dummy-project-id'", () => {
        expect(isValidWalletConnectId("dummy-project-id")).toBe(false);
      });

      it("should reject 'placeholder'", () => {
        expect(isValidWalletConnectId("placeholder")).toBe(false);
      });

      it("should reject 'your-project-id'", () => {
        expect(isValidWalletConnectId("your-project-id")).toBe(false);
      });

      it("should reject 'xxx'", () => {
        expect(isValidWalletConnectId("xxx")).toBe(false);
      });

      it("should reject 'changeme'", () => {
        expect(isValidWalletConnectId("changeme")).toBe(false);
      });

      it("should reject 'todo'", () => {
        expect(isValidWalletConnectId("todo")).toBe(false);
      });
    });

    describe("rejection cases (case-insensitive placeholders)", () => {
      it("should reject 'DUMMY' (uppercase)", () => {
        expect(isValidWalletConnectId("DUMMY")).toBe(false);
      });

      it("should reject 'Placeholder' (mixed case)", () => {
        expect(isValidWalletConnectId("Placeholder")).toBe(false);
      });

      it("should reject ' TODO ' (with whitespace)", () => {
        expect(isValidWalletConnectId(" TODO ")).toBe(false);
      });
    });

    describe("rejection cases (wrong format)", () => {
      it("should reject non-hex strings", () => {
        expect(isValidWalletConnectId("not-a-hex-string-at-all")).toBe(false);
      });

      it("should reject strings with spaces", () => {
        expect(isValidWalletConnectId("abcdef 1234")).toBe(false);
      });

      it("should reject strings with dashes (UUID format)", () => {
        // WalletConnect IDs are UUIDs WITHOUT dashes
        expect(
          isValidWalletConnectId("12345678-1234-1234-1234-123456789012"),
        ).toBe(false);
      });

      it("should reject strings with 0x prefix", () => {
        // WalletConnect IDs are NOT 0x-prefixed like Ethereum addresses
        expect(
          isValidWalletConnectId("0x1234567890abcdef1234567890abcdef"),
        ).toBe(false);
      });

      it("should reject too-short hex strings (< 8 chars)", () => {
        expect(isValidWalletConnectId("abcdef")).toBe(false);
      });

      it("should reject too-long hex strings (> 64 chars)", () => {
        const tooLong = "a".repeat(65);
        expect(isValidWalletConnectId(tooLong)).toBe(false);
      });
    });

    describe("rejection cases (wrong type)", () => {
      it("should reject non-string types", () => {
        expect(isValidWalletConnectId(42 as unknown as string)).toBe(false);
        expect(isValidWalletConnectId(null as unknown as string)).toBe(false);
        expect(isValidWalletConnectId(undefined as unknown as string)).toBe(
          false,
        );
        expect(isValidWalletConnectId({} as unknown as string)).toBe(false);
      });
    });

    describe("acceptance cases", () => {
      it("should accept 32-char hex (canonical WalletConnect v2 ID)", () => {
        const id = "1234567890abcdef1234567890abcdef";
        expect(isValidWalletConnectId(id)).toBe(true);
      });

      it("should accept uppercase hex chars", () => {
        const id = "ABCDEF1234567890ABCDEF1234567890";
        expect(isValidWalletConnectId(id)).toBe(true);
      });

      it("should accept mixed-case hex chars", () => {
        const id = "aBcDeF1234567890aBcDeF1234567890";
        expect(isValidWalletConnectId(id)).toBe(true);
      });

      it("should accept 8-char hex (minimum length)", () => {
        const id = "12345678";
        expect(isValidWalletConnectId(id)).toBe(true);
      });

      it("should accept 64-char hex (maximum length)", () => {
        const id = "a".repeat(64);
        expect(isValidWalletConnectId(id)).toBe(true);
      });

      it("should accept an all-zero 32-char ID (programmatic fallback)", () => {
        // We use this as the fallback when no ID is configured. WalletConnect
        // will reject it cleanly. The validator itself should accept the
        // format (the fallback value bypasses validation in wagmi.ts).
        const id = "0".repeat(32);
        expect(isValidWalletConnectId(id)).toBe(true);
      });
    });
  });
});
