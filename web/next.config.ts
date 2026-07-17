import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/security-headers";

/**
 * Next.js configuration.
 *
 * Security headers are defined in src/lib/security-headers.ts so they
 * can be unit-tested. See that file for documentation.
 */
const nextConfig: NextConfig = {
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
};

export default nextConfig;
