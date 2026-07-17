/**
 * GET /api/bridge/tokens
 *
 * Fetches the list of supported bridgeable tokens for a given chain from LI.FI.
 * Used to populate token selectors on the bridge page.
 *
 * Query params:
 *   chain  — chain ID (number), defaults to all supported chains
 *
 * Returns: { tokens: BridgeToken[] }
 *
 * Notes:
 *   - Uses Promise.allSettled so one chain's failure doesn't kill the whole
 *     response (M5 fix). Failed chains are silently dropped.
 *   - Rate limited to prevent abuse.
 */

import { getAddress } from "viem";
import {
  LIFI_BASE_URL,
  LIFI_API_KEY,
  isLifiConfigured,
  SOURCE_CHAINS,
} from "@/lib/bridge-server";
import {
  isValidChainId,
  errorResponse,
  successResponse,
  ERRORS,
} from "@/lib/bridge-validation";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { chainLogoUri, erc20LogoUri } from "@/lib/chain-logos";
import type { BridgeToken } from "@/lib/bridge-types";

export const dynamic = "force-dynamic";

/** Cache tokens for 5 minutes at the fetch layer. */
const REVALIDATE_SECONDS = 300;

/** Max token-list requests per minute per IP. */
const TOKENS_RATE_LIMIT = 20;

interface TokensResponse {
  tokens: BridgeToken[];
}

export async function GET(request: Request): Promise<Response> {
  // 0. Rate limit
  const ip = getClientIp(request);
  if (!rateLimit(`tokens:${ip}`, TOKENS_RATE_LIMIT)) {
    return errorResponse(ERRORS.RATE_LIMITED, 429);
  }

  // 1. Check API key
  if (!isLifiConfigured) {
    return errorResponse(ERRORS.MISSING_API_KEY, 503);
  }

  // 2. Parse and validate query params
  const url = new URL(request.url);
  const params = url.searchParams;
  const chainParam = params.get("chain");

  // If no chain specified, return a list from all supported source chains
  const chainIds = chainParam
    ? [parseInt(chainParam, 10)]
    : SOURCE_CHAINS.map((c) => c.id);

  for (const id of chainIds) {
    if (!isValidChainId(id)) return errorResponse(ERRORS.INVALID_CHAIN);
  }

  try {
    // 3. Fetch tokens for each requested chain.
    // Use allSettled so one chain's failure doesn't cause the whole
    // request to fail — the frontend can still use tokens from other chains.
    const results = await Promise.allSettled(
      chainIds.map(async (chainId) => {
        const lifiUrl = new URL(`${LIFI_BASE_URL}/tokens`);
        lifiUrl.searchParams.set("chains", String(chainId));

        const res = await fetch(lifiUrl.toString(), {
          headers: { "x-lifi-api-key": LIFI_API_KEY },
          next: { revalidate: REVALIDATE_SECONDS },
        });

        if (!res.ok) return [] as BridgeToken[];
        const data = await res.json();
        const chainTokens = (data.tokens?.[String(chainId)] || []) as Array<{
          address: string;
          symbol: string;
          name: string;
          decimals: number;
          chainId: number;
          logoURI?: string;
          priceUSD?: number;
        }>;

        return chainTokens.map(
          (t): BridgeToken => {
            const isNative =
              t.address === "0x0000000000000000000000000000000000000000" ||
              t.address === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

            // Logo resolution priority:
            //   1. logoURI from LI.FI (already populated for most popular tokens)
            //   2. Native token → trustwallet chain logo
            //   3. ERC-20 → trustwallet asset URL (best-effort; the <TokenAvatar>
            //      component falls back to a gradient if this 404s)
            let logoURI = t.logoURI;
            if (!logoURI) {
              if (isNative) {
                logoURI = chainLogoUri(chainId);
              } else {
                // Trustwallet requires EIP-55 checksummed addresses.
                // viem's getAddress does that deterministically.
                logoURI = erc20LogoUri(chainId, getAddress(t.address));
              }
            }

            return {
              address: t.address as `0x${string}`,
              symbol: t.symbol,
              name: t.name,
              decimals: t.decimals,
              chainId: t.chainId,
              logoURI,
              priceUSD: t.priceUSD,
            };
          },
        );
      }),
    );

    // Collect fulfilled results; ignore rejected ones
    const allTokens: BridgeToken[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        allTokens.push(...result.value);
      }
      // Rejected promises are intentionally swallowed — partial data is
      // better than no data for a token selector UI.
    }

    const response: TokensResponse = { tokens: allTokens };
    return successResponse(response);
  } catch (err) {
    return errorResponse(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch token list",
        code: "INTERNAL_ERROR",
      },
      500,
    );
  }
}
