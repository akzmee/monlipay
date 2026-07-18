import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/security-headers";

/**
 * Next.js configuration.
 *
 * Security headers are defined in src/lib/security-headers.ts so they
 * can be unit-tested. See that file for documentation.
 */
const nextConfig: NextConfig = {
  // `standalone` produces a self-contained .next/standalone directory
  // that includes only the node_modules actually used at runtime.
  // This is the recommended output for Docker — image stays small
  // (~150MB vs ~1.5GB) and cold-start is fast.
  // See: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
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
};

export default nextConfig;
