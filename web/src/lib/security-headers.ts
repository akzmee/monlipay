/**
 * Security headers for HTTP responses.
 *
 * Extracted from next.config.ts so they can be unit-tested.
 * The next.config.ts file lives outside src/ and isn't covered by vitest.
 *
 * Reference: https://docs.nextjs.org/app/api-reference/config/next-config-js/headers
 *
 * CSP notes:
 *   - We use a reasonably strict policy but must allow:
 *       • WalletConnect websocket + HTTP (wss:, https:)
 *       • RPC providers (Alchemy, public RPCs)
 *       • Trustwallet asset logos (raw.githubusercontent.com)
 *       • LI.FI API
 *       • Inline styles + scripts (Next.js runtime requires this in dev/prod)
 *       • data: URIs for SVG icons / inline images
 *       • blob: for dynamically-generated content
 *   - `frame-ancestors 'none'` blocks all iframing (anti-clickjacking).
 *     This supersedes X-Frame-Options but we set both for defense-in-depth.
 *   - Connect-src is intentionally permissive because the app talks to
 *     many user-configurable RPC endpoints. We restrict to https/wss
 *     which is the meaningful security boundary (no plaintext RPC leaks).
 *
 * If a future feature is blocked by CSP, the browser console will show
 * the exact directive to update.
 */

export interface SecurityHeader {
  key: string;
  value: string;
}

/**
 * The CSP directive value, broken into parts for readability and testing.
 * Joined with "; " when applied.
 */
export const CSP_DIRECTIVES: readonly string[] = [
  "default-src 'self'",
  // Allow Next.js inline runtime + eval (needed for Next.js dev/hmr; safe in prod)
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // Allow Next.js injected styles + Tailwind + style attributes
  "style-src 'self' 'unsafe-inline'",
  // Images: self + data: URIs + trustwallet assets + any https (logos from various CDNs)
  "img-src 'self' data: https: blob:",
  // Fonts: self + data:
  "font-src 'self' data:",
  // Connections: restricted to secure protocols only.
  // connect-src is intentionally broad because the app may hit any
  // user-configured RPC URL. https/wss enforces TLS, which is the
  // main security property we care about.
  "connect-src 'self' https: wss:",
  // Frames blocked (anti-clickjacking)
  "frame-ancestors 'none'",
  // Forms only submit to self
  "form-action 'self'",
  // Base URL must be self (prevents base-hijack XSS)
  "base-uri 'self'",
  // Object/embed/flash blocked entirely
  "object-src 'none'",
  // WebAssembly allowed (viem / crypto libs may use it)
  "wasm-unsafe-eval",
] as const;

/**
 * The full Content-Security-Policy header value.
 */
export const CSP_VALUE: string = CSP_DIRECTIVES.join("; ");

/**
 * All security headers applied to every HTTP response.
 * Order: most-significant first.
 */
export const SECURITY_HEADERS: readonly SecurityHeader[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Content-Security-Policy", value: CSP_VALUE },
] as const;

/**
 * Find a header value by key. Returns undefined if not present.
 * Exported for unit tests.
 */
export function findHeader(key: string): string | undefined {
  return SECURITY_HEADERS.find((h) => h.key === key)?.value;
}
