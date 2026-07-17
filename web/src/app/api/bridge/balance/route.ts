/**
 * GET /api/bridge/balance
 *
 * Scans a wallet's token balances across supported source chains.
 * Uses Alchemy (if configured) for reliable multi-chain balance reads,
 * with fallback to public RPCs.
 *
 * Query params:
 *   address  — wallet address to scan (required, 0x...)
 *   chains   — comma-separated chain IDs to scan (optional, defaults to all supported)
 *
 * Returns: { balances: TokenBalance[], chains: number[] }
 *
 * Security:
 *   - The Alchemy API key stays server-side. The client never sees it.
 *   - If Alchemy is not configured AND no public RPC is available for a chain,
 *     that chain is skipped (not crashed).
 *   - Rate limited to prevent abuse (balance scanning is expensive).
 *
 * Note: This currently only scans NATIVE token balances (ETH, MATIC, BNB, AVAX).
 * ERC-20 balance scanning would require either eth_call to balanceOf or
 * Alchemy's getTokenBalances endpoint — a future enhancement.
 */

import {
  isAlchemyConfigured,
  SOURCE_CHAINS,
  getAlchemyRpcUrl,
} from "@/lib/bridge-server";
import {
  isValidAddress,
  isValidChainId,
  errorResponse,
  successResponse,
  ERRORS,
} from "@/lib/bridge-validation";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { chainLogoUri } from "@/lib/chain-logos";
import type { TokenBalance, BalanceResponse } from "@/lib/bridge-types";

export const dynamic = "force-dynamic";

/** Max balance-scan requests per minute per IP (scans are heavy). */
const BALANCE_RATE_LIMIT = 10;

export async function GET(request: Request): Promise<Response> {
  // 0. Rate limit
  const ip = getClientIp(request);
  if (!rateLimit(`balance:${ip}`, BALANCE_RATE_LIMIT)) {
    return errorResponse(ERRORS.RATE_LIMITED, 429);
  }

  // 1. Parse and validate query params
  const url = new URL(request.url);
  const params = url.searchParams;
  const address = params.get("address") || "";
  const chainsParam = params.get("chains") || "";

  if (!isValidAddress(address)) {
    return errorResponse(ERRORS.INVALID_ADDRESS);
  }

  // Parse chain IDs
  const chainIds = chainsParam
    ? chainsParam
        .split(",")
        .map((c) => parseInt(c.trim(), 10))
        .filter((c) => !isNaN(c))
    : SOURCE_CHAINS.map((c) => c.id);

  for (const id of chainIds) {
    if (!isValidChainId(id)) return errorResponse(ERRORS.INVALID_CHAIN);
  }

  try {
    // 2. Scan native balances across all requested chains (parallel)
    // Use allSettled so one chain failing doesn't prevent showing other balances.
    const results = await Promise.allSettled(
      chainIds.map(async (chainId) => {
        const rpcUrl = getAlchemyRpcUrl(chainId);
        if (!rpcUrl) return [] as TokenBalance[];

        // Fetch native balance
        const nativeRes = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getBalance",
            params: [address, "latest"],
          }),
        });

        if (!nativeRes.ok) return [] as TokenBalance[];
        const nativeData = (await nativeRes.json()) as {
          result?: string;
          error?: { message: string };
        };

        if (nativeData.error || !nativeData.result) return [] as TokenBalance[];

        const nativeBalanceWei = BigInt(nativeData.result);
        if (nativeBalanceWei === 0n) return [] as TokenBalance[];

        // Get native token symbol based on chain
        const nativeSymbol = NATIVE_TOKEN_SYMBOLS[chainId] || "ETH";
        const nativeDecimals = 18;

        const balanceFormatted = formatTokenAmount(
          nativeBalanceWei.toString(),
          nativeDecimals,
        );

        return [
          {
            chainId,
            token: {
              address:
                "0x0000000000000000000000000000000000000000" as `0x${string}`,
              symbol: nativeSymbol,
              name: NATIVE_TOKEN_NAMES[chainId] || nativeSymbol,
              decimals: nativeDecimals,
              chainId,
              // Native token logo = chain logo (ETH, MATIC, BNB, AVAX).
              // Visually identical and the canonical source per trustwallet.
              logoURI: chainLogoUri(chainId),
            },
            balance: nativeBalanceWei.toString(),
            balanceFormatted,
            balanceUSD: 0, // Price fetch is optional, not critical
          },
        ] satisfies TokenBalance[];
      }),
    );

    // Collect fulfilled results; ignore rejected ones
    const allBalances: TokenBalance[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        allBalances.push(...result.value);
      }
    }

    const response: BalanceResponse = {
      balances: allBalances,
      chains: chainIds,
    };
    return successResponse(response);
  } catch (err) {
    return errorResponse(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch balances",
        code: "INTERNAL_ERROR",
      },
      500,
    );
  }
}

/** Native token symbols per chain ID. */
const NATIVE_TOKEN_SYMBOLS: Record<number, string> = {
  1: "ETH",
  10: "ETH",
  8453: "ETH",
  42161: "ETH",
  137: "MATIC",
  56: "BNB",
  43114: "AVAX",
};

/** Native token full names per chain ID. */
const NATIVE_TOKEN_NAMES: Record<number, string> = {
  1: "Ether",
  10: "Ether (Optimism)",
  8453: "Ether (Base)",
  42161: "Ether (Arbitrum)",
  137: "Polygon",
  56: "BNB",
  43114: "Avalanche",
};

/** Format a token amount from smallest units to human-readable. */
function formatTokenAmount(amount: string, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const amountBig = BigInt(amount);
  const whole = amountBig / divisor;
  const fraction = amountBig % divisor;
  const fractionStr = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, 4);
  return `${whole.toString()}.${fractionStr}`;
}
