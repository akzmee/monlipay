import { describe, it, expect, beforeEach } from "vitest";
import {
  rateLimit,
  getClientIp,
  _resetRateLimit,
  WINDOW_MS,
  DEFAULT_MAX,
} from "@/lib/rate-limit";

describe("rate-limit", () => {
  beforeEach(() => {
    _resetRateLimit();
  });

  describe("rateLimit", () => {
    it("should allow first request", () => {
      expect(rateLimit("test-ip")).toBe(true);
    });

    it("should allow requests up to the limit", () => {
      for (let i = 0; i < DEFAULT_MAX; i++) {
        expect(rateLimit(`ip-${i % 3}`)).toBe(true);
      }
    });

    it("should reject requests exceeding default limit", () => {
      const key = "same-ip";
      // Use up all DEFAULT_MAX slots
      for (let i = 0; i < DEFAULT_MAX; i++) {
        rateLimit(key);
      }
      // Next request should be rejected
      expect(rateLimit(key)).toBe(false);
    });

    it("should reject requests exceeding custom limit", () => {
      const key = "custom-ip";
      const limit = 3;
      for (let i = 0; i < limit; i++) {
        expect(rateLimit(key, limit)).toBe(true);
      }
      expect(rateLimit(key, limit)).toBe(false);
    });

    it("should track different keys independently", () => {
      expect(rateLimit("ip-a", 2)).toBe(true);
      expect(rateLimit("ip-a", 2)).toBe(true);
      expect(rateLimit("ip-a", 2)).toBe(false);

      // ip-b is independent
      expect(rateLimit("ip-b", 2)).toBe(true);
    });

    it("should handle route-prefixed keys (for different endpoints)", () => {
      expect(rateLimit("quote:1.2.3.4", 2)).toBe(true);
      expect(rateLimit("balance:1.2.3.4", 2)).toBe(true);
      // Same IP, different routes — should not interfere
      expect(rateLimit("quote:1.2.3.4", 2)).toBe(true);
      // Now quote is at limit
      expect(rateLimit("quote:1.2.3.4", 2)).toBe(false);
      // Balance still has room
      expect(rateLimit("balance:1.2.3.4", 2)).toBe(true);
    });
  });

  describe("getClientIp", () => {
    it("should extract IP from x-forwarded-for header", () => {
      const req = new Request("https://example.com", {
        headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      });
      expect(getClientIp(req)).toBe("1.2.3.4");
    });

    it("should extract IP from single-value x-forwarded-for", () => {
      const req = new Request("https://example.com", {
        headers: { "x-forwarded-for": "1.2.3.4" },
      });
      expect(getClientIp(req)).toBe("1.2.3.4");
    });

    it("should extract IP from x-real-ip header", () => {
      const req = new Request("https://example.com", {
        headers: { "x-real-ip": "9.9.9.9" },
      });
      expect(getClientIp(req)).toBe("9.9.9.9");
    });

    it("should prefer x-forwarded-for over x-real-ip", () => {
      const req = new Request("https://example.com", {
        headers: {
          "x-forwarded-for": "1.1.1.1",
          "x-real-ip": "2.2.2.2",
        },
      });
      expect(getClientIp(req)).toBe("1.1.1.1");
    });

    it("should return 'unknown' when no IP headers present", () => {
      const req = new Request("https://example.com");
      expect(getClientIp(req)).toBe("unknown");
    });

    it("should handle empty headers", () => {
      const req = new Request("https://example.com", {
        headers: { "x-forwarded-for": "" },
      });
      expect(getClientIp(req)).toBe("unknown");
    });

    it("should trim whitespace from IP", () => {
      const req = new Request("https://example.com", {
        headers: { "x-real-ip": "  1.2.3.4  " },
      });
      expect(getClientIp(req)).toBe("1.2.3.4");
    });
  });

  describe("WINDOW_MS and DEFAULT_MAX constants", () => {
    it("should expose window duration", () => {
      expect(WINDOW_MS).toBe(60_000);
    });

    it("should expose default max", () => {
      expect(DEFAULT_MAX).toBe(30);
    });
  });
});
