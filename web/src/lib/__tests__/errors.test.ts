import { describe, it, expect } from "vitest";
import { formatUserError } from "@/lib/errors";

describe("errors.formatUserError", () => {
  const FALLBACK = "Something went wrong";

  it("should return fallback for null/undefined", () => {
    expect(formatUserError(null, FALLBACK)).toBe(FALLBACK);
    expect(formatUserError(undefined, FALLBACK)).toBe(FALLBACK);
  });

  it("should return fallback for empty error", () => {
    expect(formatUserError("", FALLBACK)).toBe(FALLBACK);
  });

  it("should detect user rejected", () => {
    expect(formatUserError(new Error("user rejected transaction"), FALLBACK)).toBe(
      "Transaction cancelled. You can try again anytime.",
    );
    expect(formatUserError("user denied message", FALLBACK)).toContain(
      "cancelled",
    );
    expect(formatUserError("action_rejected", FALLBACK)).toContain(
      "cancelled",
    );
    expect(formatUserError("usercancel", FALLBACK)).toContain("cancelled");
    expect(formatUserError("user disapproved", FALLBACK)).toContain(
      "cancelled",
    );
  });

  it("should detect insufficient funds", () => {
    expect(formatUserError("insufficient funds for gas", FALLBACK)).toContain(
      "Not enough balance",
    );
    expect(formatUserError("insufficient balance", FALLBACK)).toContain(
      "Not enough balance",
    );
    expect(
      formatUserError("gas required exceeds allowance", FALLBACK),
    ).toContain("Not enough balance");
  });

  it("should detect wrong chain", () => {
    expect(formatUserError("wrong chain id", FALLBACK)).toContain(
      "Wrong network",
    );
    expect(formatUserError("chain mismatch detected", FALLBACK)).toContain(
      "Wrong network",
    );
    expect(formatUserError("unrecognized chain", FALLBACK)).toContain(
      "Wrong network",
    );
    expect(formatUserError("switch chain requested", FALLBACK)).toContain(
      "Wrong network",
    );
  });

  it("should extract revert reason", () => {
    expect(
      formatUserError('execution reverted: Reason: "Not authorized"', FALLBACK),
    ).toBe("Transaction failed: Not authorized");
  });

  it("should detect generic execution reverted", () => {
    expect(
      formatUserError("execution reverted without reason", FALLBACK),
    ).toBe("Transaction failed on-chain. Please try again.");
    expect(
      formatUserError("transaction reverted", FALLBACK),
    ).toBe("Transaction failed on-chain. Please try again.");
  });

  it("should detect gas estimation failures", () => {
    expect(formatUserError("gas estimate failed", FALLBACK)).toContain(
      "Couldn't estimate gas",
    );
    expect(formatUserError("fee cap too low", FALLBACK)).toContain(
      "Couldn't estimate gas",
    );
    expect(
      formatUserError("max fee per gas less than block", FALLBACK),
    ).toContain("Couldn't estimate gas");
  });

  it("should detect network errors", () => {
    expect(formatUserError("network request failed", FALLBACK)).toContain(
      "Network issue",
    );
    expect(formatUserError("rpc error", FALLBACK)).toContain("Network issue");
    expect(formatUserError("could not detect network", FALLBACK)).toContain(
      "Network issue",
    );
    expect(formatUserError("socket hang up", FALLBACK)).toContain(
      "Network issue",
    );
    expect(formatUserError("timeout reached", FALLBACK)).toContain(
      "Network issue",
    );
  });

  it("should detect nonce too low", () => {
    expect(formatUserError("nonce too low", FALLBACK)).toContain(
      "already submitted",
    );
  });

  it("should detect wallet not connected", () => {
    expect(formatUserError("wallet not connected", FALLBACK)).toContain(
      "connect your wallet",
    );
    expect(formatUserError("connector not found", FALLBACK)).toContain(
      "connect your wallet",
    );
  });

  it("should return short message as-is", () => {
    expect(formatUserError("Custom short error", FALLBACK)).toBe(
      "Custom short error",
    );
  });

  it("should return fallback for hex-heavy errors", () => {
    expect(
      formatUserError("revert 0xabcdef1234567890abcdef", FALLBACK),
    ).toBe(FALLBACK);
  });

  it("should return fallback for very long errors", () => {
    const long = "x".repeat(200);
    expect(formatUserError(long, FALLBACK)).toBe(FALLBACK);
  });

  it("should handle non-Error, non-string types", () => {
    expect(formatUserError({ foo: "bar" } as unknown, FALLBACK)).toBe(
      FALLBACK,
    );
    expect(formatUserError(42 as unknown, FALLBACK)).toBe(FALLBACK);
  });

  // -----------------------------------------------------------------
  // chainName parameter (dynamic network name support)
  // -----------------------------------------------------------------
  describe("chainName parameter", () => {
    it("should default to 'Monad Testnet' when chainName is not provided", () => {
      expect(formatUserError("wrong chain id", FALLBACK)).toContain(
        "Monad Testnet",
      );
    });

    it("should use provided chainName in wrong-network message", () => {
      expect(
        formatUserError("wrong chain id", FALLBACK, "Monad Mainnet"),
      ).toContain("Monad Mainnet");
    });

    it("should use provided chainName for chain mismatch", () => {
      const msg = formatUserError(
        "chain mismatch detected",
        FALLBACK,
        "Custom Chain",
      );
      expect(msg).toContain("Custom Chain");
    });

    it("should use provided chainName for unrecognized chain", () => {
      const msg = formatUserError(
        "unrecognized chain id",
        FALLBACK,
        "My Network",
      );
      expect(msg).toContain("My Network");
    });

    it("should not affect other error categories", () => {
      // chainName should not leak into non-chain-related errors
      expect(
        formatUserError("user rejected", FALLBACK, "Monad Mainnet"),
      ).toBe("Transaction cancelled. You can try again anytime.");
    });

    it("should not affect errors that fall through to raw message", () => {
      expect(
        formatUserError("Custom short error", FALLBACK, "Monad Mainnet"),
      ).toBe("Custom short error");
    });
  });
});
