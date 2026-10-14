import { fallback, http, type Transport } from "viem";

/** Keep indexing when the preferred provider is unavailable or out of quota. */
export function rpcWithFallback(primaryUrl: string, publicUrl: string): Transport {
  const publicRpc = http(publicUrl, { retryCount: 0, timeout: 10_000 });
  if (primaryUrl === publicUrl) return publicRpc;

  // Shared across requests, including the transport instances created by viem.
  let retryAfter = 0;
  const primary: Transport = (options) => {
    const transport = http(primaryUrl, { retryCount: 0 })({
      ...options,
      timeout: 4_000,
    });
    return {
      ...transport,
      async request(args) {
        if (Date.now() < retryAfter) throw new Error("Primary RPC cooling down");
        try {
          return await transport.request(args);
        } catch (error) {
          retryAfter = Date.now() + 60_000;
          throw error;
        }
      },
    };
  };

  // Keep the preferred provider first; retry it after the cooldown expires.
  return fallback([primary, publicRpc], { retryCount: 0, rank: false });
}
