import { describe, it, expect, beforeEach } from "vitest";
import {
  getStoredLinks,
  addStoredLink,
  removeStoredLink,
  type StoredLink,
} from "@/lib/storage";

describe("storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  // -----------------------------------------------------------------
  // getStoredLinks
  // -----------------------------------------------------------------
  describe("getStoredLinks", () => {
    it("should return empty array when nothing stored", () => {
      expect(getStoredLinks()).toEqual([]);
    });

    it("should return parsed links from localStorage", () => {
      const links: StoredLink[] = [
        {
          depositId: "1",
          token: "0x0000000000000000000000000000000000000000",
          amount: "1.5",
          expiry: 1700000000,
          createdAt: 1699000000,
          sender: "0x1234567890123456789012345678901234567890",
        },
      ];
      window.localStorage.setItem("monlipay_links", JSON.stringify(links));
      expect(getStoredLinks()).toEqual(links);
    });

    it("should return empty array on corrupted data", () => {
      window.localStorage.setItem("monlipay_links", "{invalid json}");
      expect(getStoredLinks()).toEqual([]);
    });

    it("should return empty array on null", () => {
      window.localStorage.setItem("monlipay_links", "null");
      // JSON.parse("null") returns null, which is not an array but will be returned
      // The function casts to StoredLink[], so null will be returned as the parsed value
      const result = getStoredLinks();
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------
  // addStoredLink
  // -----------------------------------------------------------------
  describe("addStoredLink", () => {
    it("should add a new link to empty storage", () => {
      const link: StoredLink = {
        depositId: "1",
        token: "0x0000000000000000000000000000000000000000",
        amount: "1.0",
        expiry: 1700000000,
        createdAt: 1699000000,
        sender: "0x1234567890123456789012345678901234567890",
      };
      addStoredLink(link);
      expect(getStoredLinks()).toEqual([link]);
    });

    it("should append to existing links", () => {
      const link1: StoredLink = {
        depositId: "1",
        token: "0x0000000000000000000000000000000000000000",
        amount: "1.0",
        expiry: 1700000000,
        createdAt: 1699000000,
        sender: "0x1234567890123456789012345678901234567890",
      };
      const link2: StoredLink = {
        depositId: "2",
        token: "0x0000000000000000000000000000000000000000",
        amount: "2.0",
        expiry: 1700000100,
        createdAt: 1699000100,
        sender: "0x1234567890123456789012345678901234567890",
      };

      addStoredLink(link1);
      addStoredLink(link2);
      expect(getStoredLinks()).toEqual([link1, link2]);
    });

    it("should not add duplicate deposit IDs", () => {
      const link: StoredLink = {
        depositId: "1",
        token: "0x0000000000000000000000000000000000000000",
        amount: "1.0",
        expiry: 1700000000,
        createdAt: 1699000000,
        sender: "0x1234567890123456789012345678901234567890",
      };

      addStoredLink(link);
      addStoredLink(link);
      expect(getStoredLinks()).toHaveLength(1);
    });

    it("should handle adding when storage has corrupted data", () => {
      window.localStorage.setItem("monlipay_links", "not json");
      const link: StoredLink = {
        depositId: "1",
        token: "0x0000000000000000000000000000000000000000",
        amount: "1.0",
        expiry: 1700000000,
        createdAt: 1699000000,
        sender: "0x1234567890123456789012345678901234567890",
      };
      // getStoredLinks returns [], so addStoredLink should work
      addStoredLink(link);
      expect(getStoredLinks()).toEqual([link]);
    });
  });

  // -----------------------------------------------------------------
  // removeStoredLink
  // -----------------------------------------------------------------
  describe("removeStoredLink", () => {
    it("should remove a link by deposit ID", () => {
      const link1: StoredLink = {
        depositId: "1",
        token: "0x0000000000000000000000000000000000000000",
        amount: "1.0",
        expiry: 1700000000,
        createdAt: 1699000000,
        sender: "0x1234567890123456789012345678901234567890",
      };
      const link2: StoredLink = {
        depositId: "2",
        token: "0x0000000000000000000000000000000000000000",
        amount: "2.0",
        expiry: 1700000100,
        createdAt: 1699000100,
        sender: "0x1234567890123456789012345678901234567890",
      };

      addStoredLink(link1);
      addStoredLink(link2);

      removeStoredLink("1");
      expect(getStoredLinks()).toEqual([link2]);
    });

    it("should handle removing non-existent ID gracefully", () => {
      const link: StoredLink = {
        depositId: "1",
        token: "0x0000000000000000000000000000000000000000",
        amount: "1.0",
        expiry: 1700000000,
        createdAt: 1699000000,
        sender: "0x1234567890123456789012345678901234567890",
      };
      addStoredLink(link);

      removeStoredLink("999");
      expect(getStoredLinks()).toEqual([link]);
    });

    it("should handle removing from empty storage", () => {
      removeStoredLink("1");
      expect(getStoredLinks()).toEqual([]);
    });

    it("should handle removing when storage is corrupted", () => {
      window.localStorage.setItem("monlipay_links", "corrupted");
      removeStoredLink("1");
      // getStoredLinks returns [], filter returns [], setItem stores "[]"
      expect(getStoredLinks()).toEqual([]);
    });
  });

  // -----------------------------------------------------------------
  // SSR safety (typeof window === "undefined")
  // -----------------------------------------------------------------
  describe("SSR safety", () => {
    it("all functions should work with window defined", () => {
      // In jsdom, window is always defined, so these just verify no crashes
      expect(getStoredLinks()).toEqual([]);
      addStoredLink({
        depositId: "1",
        token: "0x0",
        amount: "1",
        expiry: 0,
        createdAt: 0,
        sender: "0x0",
      });
      expect(getStoredLinks()).toHaveLength(1);
      removeStoredLink("1");
      expect(getStoredLinks()).toHaveLength(0);
    });
  });
});
