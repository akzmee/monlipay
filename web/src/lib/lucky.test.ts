import { describe, expect, it } from "vitest";
import { parseRecipients, validateLuckyInput } from "./lucky";
import { type Address, zeroAddress } from "viem";
const wallet = "0x1111111111111111111111111111111111111111" as Address;

describe("Lucky Link form validation", () => {
  it("parses pasted wallet lists and deduplicates them", () => {
    expect(parseRecipients(` ${wallet},\n${wallet}; ${wallet} `)).toEqual([
      wallet,
    ]);
    expect(parseRecipients("")).toEqual([]);
  });
  it("rejects invalid and zero wallets instead of silently ignoring them", () => {
    expect(() => parseRecipients(`${wallet},invalid`)).toThrow("Invalid");
    expect(() => parseRecipients(zeroAddress)).toThrow("Invalid");
  });
  it("requires enough wallets and funds for the number of slots", () => {
    expect(() => validateLuckyInput("1", 18, 2, [wallet], "Gift")).toThrow(
      "wallets",
    );
    expect(() => validateLuckyInput("0", 18, 1, [wallet], "Gift")).toThrow(
      "positive",
    );
    expect(() =>
      validateLuckyInput("1", 0, 2, [wallet, wallet], "Gift"),
    ).toThrow("small");
  });
  it("rejects excess precision rather than rounding money", () => {
    expect(() =>
      validateLuckyInput("1.0000001", 6, 1, [wallet], "Gift"),
    ).toThrow("decimal");
    expect(validateLuckyInput("1.000001", 6, 1, [wallet], "Gift")).toBe(
      1000001n,
    );
  });
  it("applies the contract byte limit to Unicode titles", () => {
    expect(() =>
      validateLuckyInput("1", 18, 1, [wallet], "界".repeat(27)),
    ).toThrow("title");
    expect(validateLuckyInput("1", 18, 1, [wallet], "界".repeat(26))).toBe(
      10n ** 18n,
    );
  });
  it("rejects oversized pools and malformed numbers", () => {
    for (const amount of ["-1", "1e4", "NaN", String(1n << 128n)])
      expect(() =>
        validateLuckyInput(amount, 0, 1, [wallet], "Gift"),
      ).toThrow();
  });
});
