import { describe, expect, it } from "vitest";
import { formatUnits, parseUnits } from "viem";
import tokenList from "../tokens.json";

describe("mainnet stablecoin amounts", () => {
  // These deployed tokens report six decimals (eth_call, Monad mainnet,
  // 2026-10-12). An 18-decimal entry would approve/fund 10^12 times too much.
  it.each(["AUSD", "USD1", "USDC", "USDT0"])(
    "encodes 12.34 %s using the token's on-chain precision",
    (symbol) => {
      const token = tokenList.tokens.find((entry) => entry.symbol === symbol)!;
      expect(token).toBeDefined();
      expect(parseUnits("12.34", token.decimals)).toBe(12_340_000n);
      expect(formatUnits(12_340_000n, token.decimals)).toBe("12.34");
    },
  );
});
