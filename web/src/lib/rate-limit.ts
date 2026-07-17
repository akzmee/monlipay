/**
 * Simple in-memory rate limiter for API routes.
 *
 * Uses a sliding window per IP address. This is intentionally simple —
 * suitable for a single-server hackathon deployment. For production,
 * replace with Redis-backed rate limiting.
 *
 * Limits:
 *   - Default: 30 requests per minute per IP
 *   - Quote/balance routes: 20 per minute (heavier upstream calls)
 *
 * The limiter is conservative — it errs on the side of allowing requests
 * if the in-memory state is corrupted or unavailable.
 */

interface RateBucket {
  /** Timestamps (ms) of recent requests. */
  timestamps: number[];
}

const buckets = new Map<string, RateBucket>();

/** Window size in ms (1 minute). */
const WINDOW_MS = 60_000;

/** Default max requests per window. */
const DEFAULT_MAX = 30;

/** Clean up expired entries periodically to avoid memory leaks. */
const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 minutes
let lastCleanup = Date.now();

function cleanup(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, bucket] of buckets) {
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < WINDOW_MS);
    if (bucket.timestamps.length === 0) {
      buckets.delete(key);
    }
  }
}

/**
 * Check whether a request is allowed under the rate limit.
 * Returns true if allowed, false if rate-limited.
 * As a side effect, records the request timestamp if allowed.
 *
 * @param key  - Unique identifier (usually IP + route name)
 * @param max  - Max requests per window (default 30)
 * @returns true if request is allowed
 */
export function rateLimit(key: string, max: number = DEFAULT_MAX): boolean {
  cleanup();

  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket) {
    buckets.set(key, { timestamps: [now] });
    return true;
  }

  // Filter out timestamps outside the window
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < WINDOW_MS);

  if (bucket.timestamps.length >= max) {
    return false; // Rate limited
  }

  bucket.timestamps.push(now);
  return true;
}

/**
 * Extract client IP from a Next.js Request.
 *
 * SECURITY:
 *   X-Forwarded-For (XFF) is trivially spoofable — an attacker can set this
 *   header to any value in their HTTP request. If we trust it blindly, an
 *   attacker gets a fresh "IP" on every request and bypasses rate limiting.
 *
 *   Mitigations implemented here:
 *     1. Validate that the first XFF entry looks like a real IPv4 or IPv6
 *        address. Random strings are rejected (falls through to "unknown").
 *     2. Cap the XFF header length we inspect (256 chars) to prevent
 *        pathological inputs.
 *     3. The ONLY way to be fully safe is to trust XFF only when the
 *        request came from a known reverse proxy. In a serverless
 *        deployment (Vercel, etc.) the platform sets XFF correctly —
 *        direct-to-app deployments behind no proxy should NOT rely on XFF.
 *        We expose `setTrustedProxyCheck` so callers can wire a platform
 *        check (e.g. verify `request.headers.get("host")` matches the
 *        expected domain, or use Vercel's `x-vercel-forwarded-for`).
 *
 * Returns "unknown" if no trustworthy IP can be determined. Callers should
 * still apply rate limiting to "unknown" — it just lumps unidentifiable
 * clients into one bucket.
 */
const XFF_MAX_LENGTH = 256;

// Default: do not trust XFF blindly. Set via setTrustedProxyCheck at app
// startup if the deployment sits behind a known reverse proxy.
let trustedProxyCheck: ((req: Request) => boolean) | null = null;

/**
 * Install a callback that returns true if the request arrived via a trusted
 * reverse proxy (e.g. Vercel, Cloudflare, nginx). When set and returning
 * true, the X-Forwarded-For header is trusted. Otherwise XFF is ignored
 * and the rate limiter falls back to x-real-ip or "unknown".
 */
export function setTrustedProxyCheck(fn: ((req: Request) => boolean) | null): void {
  trustedProxyCheck = fn;
}

/** Quick IPv4 / IPv6 syntax check. Not exhaustive, but rejects garbage. */
function isValidIp(ip: string): boolean {
  if (!ip || ip.length > 45) return false; // 45 = max IPv6 length
  // IPv4: a.b.c.d where each octet is 0-255
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4.test(ip)) {
    return ip.split(".").every((octet) => {
      const n = Number(octet);
      return n >= 0 && n <= 255;
    });
  }
  // IPv6: contains ":" and only hex + ":" + "." (for IPv4-mapped) chars
  if (ip.includes(":")) {
    return /^[0-9a-fA-F:.]+$/.test(ip);
  }
  return false;
}

export function getClientIp(request: Request): string {
  // Only consult XFF when we are behind a trusted proxy
  const trustProxy = trustedProxyCheck?.(request) ?? false;

  if (trustProxy) {
    const xff = request.headers.get("x-forwarded-for");
    if (xff && xff.length <= XFF_MAX_LENGTH) {
      const first = xff.split(",")[0]?.trim();
      if (first && isValidIp(first)) return first;
    }
    // Vercel-specific
    const vxff = request.headers.get("x-vercel-forwarded-for");
    if (vxff && vxff.length <= XFF_MAX_LENGTH) {
      const first = vxff.split(",")[0]?.trim();
      if (first && isValidIp(first)) return first;
    }
    const xri = request.headers.get("x-real-ip");
    if (xri && isValidIp(xri)) return xri.trim();
  }
  return "unknown";
}

/** Clear all rate limit state — for testing only. */
export function _resetRateLimit(): void {
  buckets.clear();
  lastCleanup = Date.now();
}

// Exported for testing
export { WINDOW_MS, DEFAULT_MAX };
