/**
 * POST /api/sponsor/claim
 *
 * Body: { request: ForwardRequestData }  (signed by the user off-chain)
 *
 * Responses:
 *   200 { ok: true, txHash }
 *   400 { ok: false, reason: "invalid_request" }
 *   429 { ok: false, reason: "rate_limited" }
 *   503 { ok: false, reason: "not_configured" | "budget_exhausted" }
 *   500 { ok: false, reason: "relay_failed" }
 */

import { getClientIp } from "@/lib/rate-limit";
import {
  relaySponsoredClaim,
  type ForwardRequestData,
  type RelayResult,
} from "@/lib/sponsor-server";
import type { Hex, Address } from "viem";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Max body size — protects against pathological inputs. */
const MAX_BODY_BYTES = 8 * 1024; // 8 KB is plenty for a ForwardRequestData

export async function POST(request: Request): Promise<Response> {
  // 1. Extract client IP for rate-limit keying
  const ip = getClientIp(request);

  // 2. Read + parse body (with size cap)
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return jsonError("Body too large", "INVALID_REQUEST", 400);
    }
    raw = JSON.parse(text);
  } catch {
    return jsonError("Malformed JSON body", "INVALID_REQUEST", 400);
  }

  // 3. Extract `request` field
  if (
    typeof raw !== "object" ||
    raw === null ||
    typeof (raw as Record<string, unknown>).request !== "object"
  ) {
    return jsonError(
      "Missing or invalid `request` field",
      "INVALID_REQUEST",
      400,
    );
  }
  const body = raw as { request: unknown };

  // 4. Convert JSON-safe (string) fields back to the typed shape
  // expected by the relay. BigInts aren't valid JSON; the client
  // serializes them as decimal strings.
  const parsed = parseRequestShape(body.request);
  if (!parsed.ok) {
    return jsonError(parsed.message, "INVALID_REQUEST", 400);
  }

  // 5. Relay
  const result = await relaySponsoredClaim({
    request: parsed.value,
    clientIp: ip,
  });

  return toHttpResponse(result);
}

/** Validate JSON shape and convert string-encoded bigints (value/gas/nonce) to native bigint. */
function parseRequestShape(
  raw: unknown,
): { ok: true; value: ForwardRequestData } | { ok: false; message: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, message: "Request must be an object." };
  }
  const r = raw as Record<string, unknown>;

  // Address-shaped fields
  if (typeof r.from !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(r.from)) {
    return { ok: false, message: "Invalid `from`." };
  }
  if (typeof r.to !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(r.to)) {
    return { ok: false, message: "Invalid `to`." };
  }

  // String-encoded bigint fields
  for (const field of ["value", "gas", "nonce"] as const) {
    if (typeof r[field] !== "string" || !/^\d+$/.test(r[field])) {
      return { ok: false, message: `Field \`${field}\` must be a decimal string.` };
    }
  }

  // Numeric deadline
  if (typeof r.deadline !== "number" || !Number.isFinite(r.deadline) || r.deadline <= 0) {
    return { ok: false, message: "Invalid `deadline`." };
  }

  // Hex-encoded data + signature
  if (typeof r.data !== "string" || !r.data.startsWith("0x")) {
    return { ok: false, message: "Invalid `data`." };
  }
  if (typeof r.signature !== "string" || !r.signature.startsWith("0x")) {
    return { ok: false, message: "Invalid `signature`." };
  }

  return {
    ok: true,
    value: {
      from: r.from as Address,
      to: r.to as Address,
      value: BigInt(r.value as string),
      gas: BigInt(r.gas as string),
      nonce: BigInt(r.nonce as string),
      deadline: r.deadline as number,
      data: r.data as Hex,
      signature: r.signature as Hex,
    },
  };
}

/**
 * Map a RelayResult to a JSON Response with the appropriate status code.
 */
function toHttpResponse(result: RelayResult): Response {
  if (result.ok) {
    return Response.json(
      { ok: true, txHash: result.txHash },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  switch (result.reason) {
    case "not_configured":
      return Response.json(
        { ok: false, reason: result.reason, message: "Sponsor not configured." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    case "rate_limited":
      return Response.json(
        { ok: false, reason: result.reason, message: "Too many requests." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(result.retryAfterSeconds),
          },
        },
      );
    case "budget_exhausted":
      return Response.json(
        {
          ok: false,
          reason: result.reason,
          message: "Daily sponsor budget exhausted. Try again tomorrow or claim directly.",
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(result.retryAfterSeconds),
          },
        },
      );
    case "invalid_request":
      return Response.json(
        { ok: false, reason: result.reason, message: result.message },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    case "relay_failed":
      return Response.json(
        { ok: false, reason: result.reason, message: result.message },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
  }
}

function jsonError(message: string, code: string, status: number): Response {
  return Response.json(
    { ok: false, reason: code.toLowerCase(), message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
