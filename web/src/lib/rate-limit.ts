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
 * Checks X-Forwarded-For (common for Vercel/proxies) and falls back to
 * a generic identifier. Returns "unknown" if no IP can be determined.
 */
export function getClientIp(request: Request): string {
  // X-Forwarded-For: client, proxy1, proxy2 — we want the first
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  // x-real-ip is set by some proxies (nginx)
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

/** Clear all rate limit state — for testing only. */
export function _resetRateLimit(): void {
  buckets.clear();
  lastCleanup = Date.now();
}

// Exported for testing
export { WINDOW_MS, DEFAULT_MAX };
