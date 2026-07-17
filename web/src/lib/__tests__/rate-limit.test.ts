import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  rateLimit,
  getClientIp,
  setTrustedProxyCheck,
  _resetRateLimit,
  WINDOW_MS,
  DEFAULT_MAX,
} from "@/lib/rate-limit";

describe("rate-limit", () => {
  beforeEach(() => {
    _resetRateLimit();
    // Reset trusted proxy check to default (no trust) before each test
    setTrustedProxyCheck(null);
  });

  afterEach(() => {
    setTrustedProxyCheck(null);
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

  describe("getClientIp — default (no trusted proxy)", () => {
    it("should return 'unknown' when XFF is present but no trusted proxy is set", () => {
      // SECURITY REGRESSION TEST: Without setTrustedProxyCheck, XFF must be
      // ignored. This prevents attackers from spoofing IPs to bypass rate
      // limiting on deployments that don't sit behind a reverse proxy.
      const req = new Request("https://example.com", {
        headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      });
      expect(getClientIp(req)).toBe("unknown");
    });

    it("should return 'unknown' when x-real-ip present but no trusted proxy is set", () => {
      const req = new Request("https://example.com", {
        headers: { "x-real-ip": "9.9.9.9" },
      });
      expect(getClientIp(req)).toBe("unknown");
    });

    it("should return 'unknown' when no headers present", () => {
      const req = new Request("https://example.com");
      expect(getClientIp(req)).toBe("unknown");
    });

    it("should return 'unknown' for empty XFF header", () => {
      const req = new Request("https://example.com", {
        headers: { "x-forwarded-for": "" },
      });
      expect(getClientIp(req)).toBe("unknown");
    });
  });

  describe("getClientIp — with trusted proxy", () => {
    beforeEach(() => {
      // Simulate a deployment behind Vercel/Cloudflare/etc
      setTrustedProxyCheck(() => true);
    });

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

    it("should extract IP from x-vercel-forwarded-for header", () => {
      const req = new Request("https://example.com", {
        headers: { "x-vercel-forwarded-for": "1.2.3.4" },
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

    it("should trim whitespace from IP", () => {
      const req = new Request("https://example.com", {
        headers: { "x-real-ip": "  1.2.3.4  " },
      });
      expect(getClientIp(req)).toBe("1.2.3.4");
    });
  });

  describe("getClientIp — XFF spoofing defenses", () => {
    beforeEach(() => {
      setTrustedProxyCheck(() => true);
    });

    it("should reject non-IP strings in XFF", () => {
      // Attacker sets arbitrary XFF value to bypass rate limit
      const req = new Request("https://example.com", {
        headers: { "x-forwarded-for": "attacker-fake-value-not-an-ip" },
      });
      expect(getClientIp(req)).toBe("unknown");
    });

    it("should reject random tokens in x-real-ip", () => {
      const req = new Request("https://example.com", {
        headers: { "x-real-ip": "not-an-ip" },
      });
      expect(getClientIp(req)).toBe("unknown");
    });

    it("should reject XFF entries with invalid octets", () => {
      const req = new Request("https://example.com", {
        headers: { "x-forwarded-for": "999.999.999.999" },
      });
      expect(getClientIp(req)).toBe("unknown");
    });

    it("should accept valid IPv6 addresses", () => {
      const req = new Request("https://example.com", {
        headers: { "x-forwarded-for": "2001:db8::1" },
      });
      expect(getClientIp(req)).toBe("2001:db8::1");
    });

    it("should reject XFF header that is too long", () => {
      const longXff = "1.2.3.4, ".repeat(50);
      const req = new Request("https://example.com", {
        headers: { "x-forwarded-for": longXff },
      });
      expect(getClientIp(req)).toBe("unknown");
    });

    it("should reject empty string in first XFF position", () => {
      const req = new Request("https://example.com", {
        headers: { "x-forwarded-for": ", 1.2.3.4" },
      });
      // First entry is empty → falls through to "unknown"
      expect(getClientIp(req)).toBe("unknown");
    });

    it("should fall through to x-real-ip when XFF first entry is invalid", () => {
      const req = new Request("https://example.com", {
        headers: {
          "x-forwarded-for": "garbage",
          "x-real-ip": "1.2.3.4",
        },
      });
      expect(getClientIp(req)).toBe("1.2.3.4");
    });
  });

  describe("setTrustedProxyCheck", () => {
    it("should accept a function and clear it with null", () => {
      // Verify the API doesn't crash and is wired correctly
      setTrustedProxyCheck(() => true);
      const req = new Request("https://example.com", {
        headers: { "x-forwarded-for": "1.2.3.4" },
      });
      expect(getClientIp(req)).toBe("1.2.3.4");

      setTrustedProxyCheck(null);
      expect(getClientIp(req)).toBe("unknown");
    });

    it("should receive the request as argument", () => {
      let receivedReq: Request | null = null;
      setTrustedProxyCheck((req) => {
        receivedReq = req;
        return false;
      });
      const req = new Request("https://example.com", {
        headers: { host: "api.example.com" },
      });
      getClientIp(req);
      expect(receivedReq).not.toBeNull();
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
