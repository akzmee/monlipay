import { describe, it, expect, beforeEach } from "vitest";
import {
  getCustomTokens,
  addCustomToken,
  removeCustomToken,
} from "@/lib/tokenStorage";
import type { TokenInfo } from "@/config/chain";

describe("tokenStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getCustomTokens", () => {
    it("should return empty array when nothing stored", () => {
      expect(getCustomTokens()).toEqual([]);
    });

    it("should return parsed tokens from localStorage", () => {
      const tokens: TokenInfo[] = [
        {
          symbol: "USDC",
          name: "USD Coin",
          address: "0x1234567890123456789012345678901234567890",
          decimals: 6,
          isNative: false,
        },
      ];
      localStorage.setItem("monlipay_custom_tokens", JSON.stringify(tokens));
      expect(getCustomTokens()).toEqual(tokens);
    });

    it("should return empty array for malformed JSON", () => {
      localStorage.setItem("monlipay_custom_tokens", "{bad json");
      expect(getCustomTokens()).toEqual([]);
    });

    it("should return empty array for non-array stored value", () => {
      localStorage.setItem("monlipay_custom_tokens", '"not an array"');
      expect(getCustomTokens()).toEqual([]);
    });

    it("should filter out invalid token entries", () => {
      const tokens = [
        {
          symbol: "USDC",
          name: "USD Coin",
          address: "0x1234567890123456789012345678901234567890",
          decimals: 6,
          isNative: false,
        },
        { foo: "bar" }, // invalid
        {
          symbol: "ETH",
          address: "0xabc",
          decimals: 18,
          isNative: true, // native tokens filtered out
        },
      ];
      localStorage.setItem("monlipay_custom_tokens", JSON.stringify(tokens));
      const result = getCustomTokens();
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe("USDC");
    });
  });

  describe("addCustomToken", () => {
    it("should add a token to the store", () => {
      const token: TokenInfo = {
        symbol: "USDT",
        name: "Tether",
        address: "0x1234567890123456789012345678901234567890",
        decimals: 6,
        isNative: false,
      };
      addCustomToken(token);
      expect(getCustomTokens()).toHaveLength(1);
    });

    it("should not add native tokens", () => {
      addCustomToken({
        symbol: "ETH",
        name: "Ether",
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        isNative: true,
      });
      expect(getCustomTokens()).toEqual([]);
    });

    it("should not duplicate tokens with same address (case-insensitive)", () => {
      const addr = "0xABCdef1234567890123456789012345678901234";
      const token1: TokenInfo = {
        symbol: "T1",
        name: "Token 1",
        address: addr,
        decimals: 18,
        isNative: false,
      };
      const token2: TokenInfo = {
        symbol: "T2",
        name: "Token 2",
        address: addr.toLowerCase() as `0x${string}`,
        decimals: 18,
        isNative: false,
      };
      addCustomToken(token1);
      addCustomToken(token2);
      expect(getCustomTokens()).toHaveLength(1);
    });

    it("should allow adding multiple different tokens", () => {
      addCustomToken({
        symbol: "A",
        name: "Token A",
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        decimals: 18,
        isNative: false,
      });
      addCustomToken({
        symbol: "B",
        name: "Token B",
        address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        decimals: 6,
        isNative: false,
      });
      expect(getCustomTokens()).toHaveLength(2);
    });
  });

  describe("removeCustomToken", () => {
    it("should remove a token by address (case-insensitive)", () => {
      const addr = "0xABCdef1234567890123456789012345678901234";
      addCustomToken({
        symbol: "TST",
        name: "Test",
        address: addr,
        decimals: 18,
        isNative: false,
      });
      expect(getCustomTokens()).toHaveLength(1);

      removeCustomToken(addr.toLowerCase());
      expect(getCustomTokens()).toHaveLength(0);
    });

    it("should do nothing if address not found", () => {
      addCustomToken({
        symbol: "TST",
        name: "Test",
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        decimals: 18,
        isNative: false,
      });
      removeCustomToken("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
      expect(getCustomTokens()).toHaveLength(1);
    });

    it("should do nothing when store is empty", () => {
      removeCustomToken("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      expect(getCustomTokens()).toEqual([]);
    });
  });
});
