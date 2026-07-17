/**
 * GET /api/bridge/quote
 *
 * Fetches bridge route quotes from LI.FI (server-side).
 * The LI.FI API key is stored in a server-only env var and is NEVER
 * sent to or visible from the browser.
 *
 * Query params:
 *   fromChain    — source chain ID (number)
 *   fromToken    — source token address (0x...)
 *   fromAmount   — amount in smallest units (string)
 *   toChain      — destination chain ID (number, must equal MONAD_DESTINATION_CHAIN_ID)
 *   toToken      — destination token address (0x...)
 *   fromAddress  — sender address (0x...)
 *
 * Returns: { routes: BridgeRoute[] }
 *
 * Security:
 *   - API key stays server-side (no NEXT_PUBLIC_ prefix)
 *   - All inputs validated before passing to upstream LI.FI call
 *   - Rate limited to prevent abuse
 *   - toChain must match the configured Monad chain ID (testnet or mainnet)
 */

import {
  LIFI_BASE_URL,
  LIFI_API_KEY,
  isLifiConfigured,
  MONAD_DESTINATION_CHAIN_ID,
} from "@/lib/bridge-server";
import {
  isValidAddress,
  isValidChainId,
  isValidAmount,
  errorResponse,
  successResponse,
  ERRORS,
} from "@/lib/bridge-validation";
import { extractCostUSD } from "@/lib/lifi-parse";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import type { BridgeRoute, QuoteResponse } from "@/lib/bridge-types";

export const dynamic = "force-dynamic";

/** Max quote requests per minute per IP. */
const QUOTE_RATE_LIMIT = 20;

export async function GET(request: Request): Promise<Response> {
  // 0. Rate limit
  const ip = getClientIp(request);
  if (!rateLimit(`quote:${ip}`, QUOTE_RATE_LIMIT)) {
    return errorResponse(ERRORS.RATE_LIMITED, 429);
  }

  // 1. Check API key
  if (!isLifiConfigured) {
    return errorResponse(ERRORS.MISSING_API_KEY, 503);
  }

  // 2. Parse and validate query params
  const url = new URL(request.url);
  const params = url.searchParams;

  const fromChain = parseInt(params.get("fromChain") || "", 10);
  const fromToken = params.get("fromToken") || "";
  const fromAmount = params.get("fromAmount") || "";
  const toChain = parseInt(params.get("toChain") || "", 10);
  const toToken = params.get("toToken") || "";
  const fromAddress = params.get("fromAddress") || "";

  if (!isValidChainId(fromChain)) return errorResponse(ERRORS.INVALID_CHAIN);
  if (!isValidChainId(toChain)) return errorResponse(ERRORS.INVALID_CHAIN);
  if (!isValidAddress(fromToken))
    return errorResponse(ERRORS.INVALID_ADDRESS);
  if (!isValidAddress(toToken)) return errorResponse(ERRORS.INVALID_ADDRESS);
  if (!isValidAddress(fromAddress))
    return errorResponse(ERRORS.INVALID_ADDRESS);
  if (!isValidAmount(fromAmount))
    return errorResponse(ERRORS.INVALID_AMOUNT);

  // 3. Enforce destination chain is Monad
  // This prevents abuse where someone could use our API as a generic LI.FI proxy
  if (toChain !== MONAD_DESTINATION_CHAIN_ID) {
    return errorResponse(ERRORS.INVALID_DEST_CHAIN, 403);
  }

  // 4. Fetch from LI.FI
  try {
    const lifiUrl = new URL(`${LIFI_BASE_URL}/quote`);
    lifiUrl.searchParams.set("fromChain", String(fromChain));
    lifiUrl.searchParams.set("fromToken", fromToken);
    lifiUrl.searchParams.set("fromAmount", fromAmount);
    lifiUrl.searchParams.set("toChain", String(toChain));
    lifiUrl.searchParams.set("toToken", toToken);
    lifiUrl.searchParams.set("fromAddress", fromAddress);

    const res = await fetch(lifiUrl.toString(), {
      headers: {
        "x-lifi-api-key": LIFI_API_KEY,
      },
      // Don't cache — quotes change constantly
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return errorResponse(
        {
          error:
            (body as { message?: string })?.message ||
            "LI.FI quote request failed",
          code: "LIFI_ERROR",
        },
        res.status,
      );
    }

    const data = (await res.json()) as {
      estimate?: {
        executionDuration?: number;
        gasCosts?: unknown;
        toAmount?: string;
        toAmountMin?: string;
        feeCosts?: unknown;
      };
      tool?: string;
      toolDetails?: { key: string; name: string; logoURI: string };
      action?: {
        fromToken?: {
          address: string;
          symbol: string;
          decimals: number;
          chainId: number;
          name?: string;
        };
        toToken?: {
          address: string;
          symbol: string;
          decimals: number;
          chainId: number;
          name?: string;
        };
        fromAmount?: string;
        fromChainId?: number;
        toChainId?: number;
      };
      id?: string;
      integrator?: string;
      includedSteps?: unknown[];
    };

    // LI.FI /quote returns a single route object (not an array)
    if (!data.estimate || !data.action) {
      return errorResponse(
        { error: "No route found for this request", code: "NO_ROUTE" },
        404,
      );
    }

    // Parse fee arrays safely — LI.FI returns arrays of cost objects
    const gasCostUSD = extractCostUSD(data.estimate.gasCosts);
    const bridgeFeeUSD = extractCostUSD(data.estimate.feeCosts);

    const route: BridgeRoute = {
      id: data.id || "unknown",
      tool: data.tool || "unknown",
      toolDetails: {
        key: data.toolDetails?.key || data.tool || "unknown",
        name: data.toolDetails?.name || data.tool || "Unknown",
        logoURI: data.toolDetails?.logoURI || "",
      },
      executionDuration: data.estimate.executionDuration || 0,
      fromToken: {
        address: (data.action.fromToken?.address || fromToken) as `0x${string}`,
        symbol: data.action.fromToken?.symbol || "",
        name: data.action.fromToken?.name || "",
        decimals: data.action.fromToken?.decimals || 18,
        chainId: data.action.fromToken?.chainId || fromChain,
      },
      toToken: {
        address: (data.action.toToken?.address || toToken) as `0x${string}`,
        symbol: data.action.toToken?.symbol || "",
        name: data.action.toToken?.name || "",
        decimals: data.action.toToken?.decimals || 18,
        chainId: data.action.toToken?.chainId || toChain,
      },
      fromAmount: data.action.fromAmount || fromAmount,
      toAmount: data.estimate.toAmount || "0",
      toAmountMin: data.estimate.toAmountMin || "0",
      gasCostUSD,
      fees: {
        bridgeFeeUSD,
        gasCostUSD,
      },
      steps: data.includedSteps?.length || 1,
    };

    const response: QuoteResponse = { routes: [route] };
    return successResponse(response);
  } catch (err) {
    return errorResponse(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch bridge quote",
        code: "INTERNAL_ERROR",
      },
      500,
    );
  }
}
