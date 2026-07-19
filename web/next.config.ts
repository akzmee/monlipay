import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/security-headers";

/**
 * Next.js configuration.
 *
 * Security headers are defined in src/lib/security-headers.ts so they
 * can be unit-tested. See that file for documentation.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS.map((h) => ({
          key: h.key,
          value: h.value,
        })),
      },
    ];
  },
  async rewrites() {
    return [
      {
        // Proxy indexer API requests through Next.js to avoid CORS issues.
        // Browser calls /indexer/v1/links/:address → Next.js proxies to
        // http://indexer:42069/v1/links/:address (Docker internal network)
        source: "/indexer/:path*",
        destination: `http://indexer:42069/:path*`,
      },
    ];
  },
};

export default nextConfig;
