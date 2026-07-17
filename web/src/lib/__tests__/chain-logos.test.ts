import { describe, it, expect } from "vitest";
import {
  CHAIN_SLUGS,
  chainLogoUri,
  erc20LogoUri,
} from "@/lib/chain-logos";

describe("chain-logos", () => {
  // -----------------------------------------------------------------
  // CHAIN_SLUGS
  // -----------------------------------------------------------------
  describe("CHAIN_SLUGS", () => {
    it("should map known chain IDs to trustwallet slugs", () => {
      expect(CHAIN_SLUGS[1]).toBe("ethereum");
      expect(CHAIN_SLUGS[10]).toBe("optimism");
      expect(CHAIN_SLUGS[8453]).toBe("base");
      expect(CHAIN_SLUGS[42161]).toBe("arbitrum");
      expect(CHAIN_SLUGS[137]).toBe("polygon");
      expect(CHAIN_SLUGS[56]).toBe("binance");
      expect(CHAIN_SLUGS[43114]).toBe("avalanchex");
      expect(CHAIN_SLUGS[10143]).toBe("monad");
      expect(CHAIN_SLUGS[143]).toBe("monad");
    });

    it("should return undefined for unknown chain IDs", () => {
      expect(CHAIN_SLUGS[999999]).toBeUndefined();
      expect(CHAIN_SLUGS[0]).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------
  // chainLogoUri
  // -----------------------------------------------------------------
  describe("chainLogoUri", () => {
    it("should build the correct trustwallet URL for ethereum", () => {
      expect(chainLogoUri(1)).toBe(
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
      );
    });

    it("should build the correct URL for binance (slug differs from shortName)", () => {
      expect(chainLogoUri(56)).toBe(
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png",
      );
    });

    it("should build the correct URL for avalanche (slug 'avalanchex')", () => {
      expect(chainLogoUri(43114)).toBe(
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchex/info/logo.png",
      );
    });

    it("should build the correct URL for monad testnet", () => {
      expect(chainLogoUri(10143)).toBe(
        "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/monad/info/logo.png",
      );
    });

    it("should return undefined for unknown chain ID", () => {
      expect(chainLogoUri(999999)).toBeUndefined();
    });

    it("should return undefined for chain ID 0", () => {
      expect(chainLogoUri(0)).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------
  // erc20LogoUri
  // -----------------------------------------------------------------
  describe("erc20LogoUri", () => {
    it("should build the correct trustwallet ERC-20 URL", () => {
      const addr = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
      expect(erc20LogoUri(1, addr)).toBe(
        `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${addr}/logo.png`,
      );
    });

    it("should build the correct URL for base chain", () => {
      const addr = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
      expect(erc20LogoUri(8453, addr)).toBe(
        `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/${addr}/logo.png`,
      );
    });

    it("should return undefined for unknown chain ID", () => {
      expect(erc20LogoUri(999999, "0xabc")).toBeUndefined();
    });

    it("should not validate the checksum format (caller responsibility)", () => {
      // The function only embeds whatever is passed — callers must EIP-55
      // checksum the address. This test documents that behavior.
      const lower = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
      expect(erc20LogoUri(1, lower)).toContain(lower);
    });
  });
});
