import { describe, it, expect } from "vitest";
import {
  SECURITY_HEADERS,
  CSP_DIRECTIVES,
  CSP_VALUE,
  findHeader,
} from "@/lib/security-headers";

describe("security-headers", () => {
  describe("SECURITY_HEADERS", () => {
    it("should be a non-empty array", () => {
      expect(Array.isArray(SECURITY_HEADERS)).toBe(true);
      expect(SECURITY_HEADERS.length).toBeGreaterThanOrEqual(6);
    });

    it("should contain X-Content-Type-Options: nosniff", () => {
      expect(findHeader("X-Content-Type-Options")).toBe("nosniff");
    });

    it("should contain X-Frame-Options: DENY", () => {
      expect(findHeader("X-Frame-Options")).toBe("DENY");
    });

    it("should contain Referrer-Policy", () => {
      const value = findHeader("Referrer-Policy");
      expect(value).toBeDefined();
      expect(value).toContain("strict-origin");
    });

    it("should contain Permissions-Policy with camera, microphone disabled", () => {
      const value = findHeader("Permissions-Policy");
      expect(value).toBeDefined();
      expect(value).toContain("camera=()");
      expect(value).toContain("microphone=()");
      expect(value).toContain("geolocation=()");
    });

    it("should contain Strict-Transport-Security with long max-age", () => {
      const value = findHeader("Strict-Transport-Security");
      expect(value).toBeDefined();
      expect(value).toMatch(/max-age=\d{5,}/);
      expect(value).toContain("includeSubDomains");
      expect(value).toContain("preload");
    });

    it("should contain X-DNS-Prefetch-Control", () => {
      expect(findHeader("X-DNS-Prefetch-Control")).toBe("on");
    });

    it("should contain Content-Security-Policy", () => {
      const csp = findHeader("Content-Security-Policy");
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
    });
  });

  describe("CSP_DIRECTIVES", () => {
    it("should include default-src 'self'", () => {
      expect(CSP_DIRECTIVES).toContain("default-src 'self'");
    });

    it("should block frame-ancestors (anti-clickjacking)", () => {
      expect(CSP_DIRECTIVES).toContain("frame-ancestors 'none'");
    });

    it("should restrict form-action to self", () => {
      expect(CSP_DIRECTIVES).toContain("form-action 'self'");
    });

    it("should restrict base-uri to self", () => {
      expect(CSP_DIRECTIVES).toContain("base-uri 'self'");
    });

    it("should block object-src entirely", () => {
      expect(CSP_DIRECTIVES).toContain("object-src 'none'");
    });

    it("should allow wasm-unsafe-eval for crypto libs", () => {
      expect(CSP_DIRECTIVES).toContain("wasm-unsafe-eval");
    });

    it("should allow https/wss connections (for RPC providers)", () => {
      const connectSrc = CSP_DIRECTIVES.find((d) =>
        d.startsWith("connect-src"),
      );
      expect(connectSrc).toBeDefined();
      expect(connectSrc).toContain("https:");
      expect(connectSrc).toContain("wss:");
    });

    it("should NOT allow http: in connect-src (no plaintext RPC)", () => {
      // SECURITY: connect-src must not allow plaintext http: because
      // RPC traffic over HTTP can be intercepted by MITM attackers.
      // The wildcard "https:" doesn't match "http:" — only https:.
      const connectSrc = CSP_DIRECTIVES.find((d) =>
        d.startsWith("connect-src"),
      );
      expect(connectSrc).toBeDefined();
      // Verify there's no "http:" that isn't part of "https:"
      // We do this by checking that "http:" appears only as part of "https:"
      const withoutHttps = (connectSrc ?? "").replace(/https:/g, "");
      expect(withoutHttps).not.toContain("http:");
    });

    it("should allow img-src from https (logos from CDNs)", () => {
      const imgSrc = CSP_DIRECTIVES.find((d) => d.startsWith("img-src"));
      expect(imgSrc).toBeDefined();
      expect(imgSrc).toContain("https:");
      expect(imgSrc).toContain("data:");
    });

    it("should NOT contain 'unsafe-inline' for script-src without also restricting default-src", () => {
      // Next.js requires 'unsafe-inline' for script-src. We document this
      // is intentional and verify default-src is 'self'.
      const scriptSrc = CSP_DIRECTIVES.find((d) =>
        d.startsWith("script-src"),
      );
      expect(scriptSrc).toBeDefined();
      // 'unsafe-inline' is allowed for script-src (Next.js requirement)
      expect(scriptSrc).toContain("'unsafe-inline'");
      // default-src must still be 'self' so other resource types are restricted
      expect(CSP_DIRECTIVES).toContain("default-src 'self'");
    });
  });

  describe("CSP_VALUE", () => {
    it("should join directives with semicolons", () => {
      expect(CSP_VALUE).toContain(";");
      // Should not end with a trailing semicolon
      expect(CSP_VALUE.endsWith(";")).toBe(false);
    });

    it("should start with default-src", () => {
      expect(CSP_VALUE.startsWith("default-src 'self'")).toBe(true);
    });

    it("should contain every directive from CSP_DIRECTIVES", () => {
      for (const directive of CSP_DIRECTIVES) {
        expect(CSP_VALUE).toContain(directive);
      }
    });
  });

  describe("findHeader", () => {
    it("should return value for known header", () => {
      expect(findHeader("X-Frame-Options")).toBe("DENY");
    });

    it("should return undefined for unknown header", () => {
      expect(findHeader("X-Nonexistent-Header")).toBeUndefined();
    });

    it("should be case-sensitive (headers are case-sensitive in HTTP)", () => {
      // Lowercase input should NOT match
      expect(findHeader("x-frame-options")).toBeUndefined();
    });
  });
});
