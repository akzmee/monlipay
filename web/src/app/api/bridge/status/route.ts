/**
 * GET /api/bridge/status
 *
 * Tracks the status of a bridge transaction via LI.FI's status endpoint.
 * Used by the frontend to show real-time progress: submitted → pending → done.
 *
 * Query params:
 *   txHash   — source chain transaction hash (required, 0x + 64 hex)
 *   bridge   — bridge/tool name from the route (required, e.g. "deBridge")
 *
 * Returns: StatusResponse
 *
 * Notes:
 *   - LI.FI returns status strings UPPERCASE ("DONE", "PENDING").
 *     We normalize to our lowercase BridgeStatus union before returning.
 *   - The `bridge` parameter is validated to prevent URL injection.
 *   - We no longer default to "deBridge" — the caller must specify which
 *     bridge tool was used, since LI.FI's status endpoint is per-tool.
 */

import {
  LIFI_BASE_URL,
  LIFI_API_KEY,
  isLifiConfigured,
} from "@/lib/bridge-server";
import {
  isValidTxHash,
  isValidBridgeName,
  errorResponse,
  successResponse,
  ERRORS,
} from "@/lib/bridge-validation";
import { normalizeStatus } from "@/lib/lifi-parse";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import type { StatusResponse } from "@/lib/bridge-types";

export const dynamic = "force-dynamic";

/** Max status requests per minute per IP (status is polled, so higher). */
const STATUS_RATE_LIMIT = 60;

export async function GET(request: Request): Promise<Response> {
  // 0. Rate limit
  const ip = getClientIp(request);
  if (!rateLimit(`status:${ip}`, STATUS_RATE_LIMIT)) {
    return errorResponse(ERRORS.RATE_LIMITED, 429);
  }

  // 1. Check API key
  if (!isLifiConfigured) {
    return errorResponse(ERRORS.MISSING_API_KEY, 503);
  }

  // 2. Parse and validate query params
  const url = new URL(request.url);
  const params = url.searchParams;
  const txHash = params.get("txHash") || "";
  const bridge = params.get("bridge") || "";

  if (!isValidTxHash(txHash)) {
    return errorResponse(ERRORS.INVALID_TX_HASH);
  }
  // Bridge name is required and validated — do NOT default to "deBridge"
  if (!isValidBridgeName(bridge)) {
    return errorResponse(ERRORS.INVALID_BRIDGE_NAME);
  }

  try {
    const lifiUrl = new URL(`${LIFI_BASE_URL}/status`);
    lifiUrl.searchParams.set("txHash", txHash);
    lifiUrl.searchParams.set("bridge", bridge);

    const res = await fetch(lifiUrl.toString(), {
      headers: { "x-lifi-api-key": LIFI_API_KEY },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return errorResponse(
        {
          error:
            (body as { message?: string })?.message ||
            "LI.FI status request failed",
          code: "LIFI_ERROR",
        },
        res.status,
      );
    }

    const data = (await res.json()) as {
      status?: string;
      substatus?: string;
      sending?: { txHash?: string; chainId?: number };
      receiving?: { txHash?: string; chainId?: number };
      bridgeExplorerLink?: string;
    };

    // Normalize status from LI.FI's UPPERCASE to our lowercase union
    const normalizedStatus = normalizeStatus(data.status);

    const response: StatusResponse = {
      status: normalizedStatus,
      substatus: data.substatus,
      explorerUrl: data.bridgeExplorerLink,
      sending: data.sending?.txHash
        ? {
            txHash: data.sending.txHash,
            chainId: data.sending.chainId || 0,
          }
        : undefined,
      receiving: data.receiving?.txHash
        ? {
            txHash: data.receiving.txHash,
            chainId: data.receiving.chainId || 0,
          }
        : undefined,
    };

    return successResponse(response);
  } catch (err) {
    return errorResponse(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch transaction status",
        code: "INTERNAL_ERROR",
      },
      500,
    );
  }
}
