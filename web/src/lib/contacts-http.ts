import { isAddress, type Address } from "viem";
import { contactsStore } from "./contacts-store";

export const SESSION_COOKIE = "monlipay_contacts";
export const CHALLENGE_COOKIE = "monlipay_contacts_challenge";
export function readCookie(request: Request, name: string): string {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`));
  const token = value?.slice(name.length + 1) || "";
  return /^[a-f0-9]{64}$/.test(token) ? token : "";
}
export function sessionCookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", Vary: "Cookie, X-Wallet-Address" },
  });
}
export function requestOrigin(request: Request) {
  if (process.env.APP_ORIGIN) return new URL(process.env.APP_ORIGIN).origin;
  if (process.env.NODE_ENV === "production")
    throw new Error("Configure APP_ORIGIN before enabling contacts.");
  const url = new URL(request.url);
  // Next's internal request URL may use localhost when a browser uses 127.0.0.1.
  return new URL(`${url.protocol}//${request.headers.get("host") || url.host}`)
    .origin;
}
export function checkOrigin(request: Request) {
  if (request.headers.get("origin") !== requestOrigin(request))
    throw new Error("Request origin is not allowed.");
}
export function contactOwner(request: Request): Address | null {
  if (request.headers.get("sec-fetch-site") === "cross-site") return null;
  const requested = request.headers.get("x-wallet-address");
  if (!requested || !isAddress(requested)) return null;
  const owner = contactsStore().owner(readCookie(request, SESSION_COOKIE));
  return owner?.toLowerCase() === requested.toLowerCase() ? owner : null;
}
export async function readJson(
  request: Request,
  maxBytes = 8192,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("Expected JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing request body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("Request is too large.");
    }
    chunks.push(value);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid request.");
  return value;
}
