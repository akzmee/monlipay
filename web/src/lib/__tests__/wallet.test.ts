import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isMobile,
  hasInjectedProvider,
  needsWalletBrowser,
  getMetaMaskDeepLink,
  getTrustWalletDeepLink,
} from "@/lib/wallet";

describe("wallet utilities", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("isMobile", () => {
    it("should return false on SSR (no navigator)", () => {
      expect(isMobile()).toBe(false);
    });

    it("should return true for iPhone user agent", () => {
      const original = navigator.userAgent;
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
        configurable: true,
      });
      expect(isMobile()).toBe(true);
      Object.defineProperty(navigator, "userAgent", {
        value: original,
        configurable: true,
      });
    });

    it("should return true for Android user agent", () => {
      const original = navigator.userAgent;
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (Linux; Android 13; Pixel 7)",
        configurable: true,
      });
      expect(isMobile()).toBe(true);
      Object.defineProperty(navigator, "userAgent", {
        value: original,
        configurable: true,
      });
    });

    it("should return false for desktop Chrome user agent", () => {
      const original = navigator.userAgent;
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0",
        configurable: true,
      });
      expect(isMobile()).toBe(false);
      Object.defineProperty(navigator, "userAgent", {
        value: original,
        configurable: true,
      });
    });
  });

  describe("hasInjectedProvider", () => {
    it("should return false on SSR", () => {
      expect(hasInjectedProvider()).toBe(false);
    });

    it("should return true when window.ethereum exists", () => {
      (window as any).ethereum = { isMetaMask: true };
      expect(hasInjectedProvider()).toBe(true);
      delete (window as any).ethereum;
    });

    it("should return false when window.ethereum does not exist", () => {
      delete (window as any).ethereum;
      expect(hasInjectedProvider()).toBe(false);
    });
  });

  describe("needsWalletBrowser", () => {
    it("should return false when not mobile", () => {
      // jsdom default UA is not mobile
      delete (window as any).ethereum;
      expect(needsWalletBrowser()).toBe(false);
    });

    it("should return false when mobile but has injected provider", () => {
      const original = navigator.userAgent;
      Object.defineProperty(navigator, "userAgent", {
        value: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)",
        configurable: true,
      });
      (window as any).ethereum = { isMetaMask: true };
      expect(needsWalletBrowser()).toBe(false);
      delete (window as any).ethereum;
      Object.defineProperty(navigator, "userAgent", {
        value: original,
        configurable: true,
      });
    });
  });

  describe("getMetaMaskDeepLink", () => {
    it("should generate a MetaMask deep link", () => {
      const url = "https://monlipay.app/claim#42/0xabc";
      const link = getMetaMaskDeepLink(url);
      expect(link).toContain("metamask.app.link/dapp/");
      expect(link).toContain("monlipay.app/claim");
    });

    it("should use window.location.href when no URL provided", () => {
      const link = getMetaMaskDeepLink();
      expect(link).toContain("metamask.app.link/dapp/");
    });
  });

  describe("getTrustWalletDeepLink", () => {
    it("should generate a Trust Wallet deep link", () => {
      const url = "https://monlipay.app/claim#42/0xabc";
      const link = getTrustWalletDeepLink(url);
      expect(link).toContain("link.trustwallet.com");
      expect(link).toContain(encodeURIComponent(url));
    });
  });
});
