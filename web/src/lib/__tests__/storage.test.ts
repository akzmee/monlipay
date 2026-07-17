import { describe, it, expect, beforeEach } from "vitest";
import {
  getStoredLinks,
  addStoredLink,
  removeStoredLink,
  updateStoredLinkStatus,
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
      // JSON.parse("null") returns null, which is not an array — filtered out
      expect(getStoredLinks()).toEqual([]);
    });

    it("should filter out corrupted entries (not valid StoredLink shape)", () => {
      // SECURITY: A corrupted localStorage must not crash the app. Invalid
      // entries are silently filtered out, leaving only valid ones.
      const mixed = [
        {
          depositId: "1",
          token: "0x0000000000000000000000000000000000000000",
          amount: "1.5",
          expiry: 1700000000,
          createdAt: 1699000000,
          sender: "0x1234567890123456789012345678901234567890",
          shareableUrl: "https://example.com/claim#1-abc",
        },
        // Corrupted entries:
        { depositId: "2" }, // missing fields
        null,
        "string-not-object",
        42,
        { depositId: 123, token: "0x0", amount: "1", expiry: 0, createdAt: 0, sender: "0x0" }, // wrong types
      ];
      window.localStorage.setItem("monlipay_links", JSON.stringify(mixed));
      const result = getStoredLinks();
      expect(result).toHaveLength(1);
      expect(result[0].depositId).toBe("1");
    });

    it("should preserve shareableUrl when present", () => {
      const links: StoredLink[] = [
        {
          depositId: "1",
          token: "0x0000000000000000000000000000000000000000",
          amount: "1.5",
          expiry: 1700000000,
          createdAt: 1699000000,
          sender: "0x1234567890123456789012345678901234567890",
          shareableUrl: "https://monlipay.app/claim#1-secret",
        },
      ];
      window.localStorage.setItem("monlipay_links", JSON.stringify(links));
      expect(getStoredLinks()[0].shareableUrl).toBe(
        "https://monlipay.app/claim#1-secret",
      );
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
  // updateStoredLinkStatus
  // -----------------------------------------------------------------
  describe("updateStoredLinkStatus", () => {
    it("should update status of existing link", () => {
      const link: StoredLink = {
        depositId: "1",
        token: "0x0000000000000000000000000000000000000000",
        amount: "1.0",
        expiry: 1700000000,
        createdAt: 1699000000,
        sender: "0x1234567890123456789012345678901234567890",
      };
      addStoredLink(link);

      updateStoredLinkStatus("1", "refunded");
      const result = getStoredLinks();
      expect(result[0].status).toBe("refunded");
    });

    it("should update status to claimed", () => {
      const link: StoredLink = {
        depositId: "1",
        token: "0x0",
        amount: "1",
        expiry: 0,
        createdAt: 0,
        sender: "0x0",
      };
      addStoredLink(link);

      updateStoredLinkStatus("1", "claimed");
      expect(getStoredLinks()[0].status).toBe("claimed");
    });

    it("should not affect other links when updating one", () => {
      addStoredLink({
        depositId: "1",
        token: "0x0",
        amount: "1",
        expiry: 0,
        createdAt: 0,
        sender: "0x0",
      });
      addStoredLink({
        depositId: "2",
        token: "0x0",
        amount: "2",
        expiry: 0,
        createdAt: 0,
        sender: "0x0",
      });

      updateStoredLinkStatus("1", "refunded");
      const links = getStoredLinks();
      expect(links[0].status).toBe("refunded");
      expect(links[1].status).toBeUndefined();
    });

    it("should handle updating non-existent ID gracefully", () => {
      // No crash, no side effect
      updateStoredLinkStatus("999", "refunded");
      expect(getStoredLinks()).toEqual([]);
    });

    it("should preserve other fields when updating status", () => {
      const link: StoredLink = {
        depositId: "1",
        token: "0x0000000000000000000000000000000000000000",
        amount: "1.0",
        expiry: 1700000000,
        createdAt: 1699000000,
        sender: "0x1234567890123456789012345678901234567890",
        shareableUrl: "https://monlipay.app/claim#1-abc",
      };
      addStoredLink(link);

      updateStoredLinkStatus("1", "refunded");
      const result = getStoredLinks()[0];
      expect(result.token).toBe(link.token);
      expect(result.amount).toBe(link.amount);
      expect(result.expiry).toBe(link.expiry);
      expect(result.sender).toBe(link.sender);
      expect(result.shareableUrl).toBe(link.shareableUrl);
      expect(result.status).toBe("refunded");
    });

    it("should overwrite previous status", () => {
      addStoredLink({
        depositId: "1",
        token: "0x0",
        amount: "1",
        expiry: 0,
        createdAt: 0,
        sender: "0x0",
      });

      updateStoredLinkStatus("1", "active");
      updateStoredLinkStatus("1", "expired");
      updateStoredLinkStatus("1", "refunded");

      expect(getStoredLinks()[0].status).toBe("refunded");
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
      updateStoredLinkStatus("1", "refunded"); // no crash
    });
  });
});
