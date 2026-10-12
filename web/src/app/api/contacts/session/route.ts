import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  isHex,
  zeroAddress,
} from "viem";
import { createSiweMessage } from "viem/siwe";
import { monadChain } from "@/config/chain";
import { contactsStore } from "@/lib/contacts-store";
import {
  CHALLENGE_COOKIE,
  SESSION_COOKIE,
  checkOrigin,
  json,
  readCookie,
  requestOrigin,
  readJson,
  sessionCookie,
} from "@/lib/contacts-http";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
  } catch {
    return json({ error: "Request origin is not allowed." }, 403);
  }
  if (!rateLimit(`contacts-auth:${getClientIp(request)}`, 20))
    return json(
      { error: "Too many sign-in attempts. Try again in a minute." },
      429,
    );
  try {
    const body = await readJson(request);
    const store = contactsStore();
    if (body.action === "challenge") {
      if (
        typeof body.address !== "string" ||
        !isAddress(body.address) ||
        body.address === zeroAddress
      )
        return json({ error: "Connect a valid wallet." }, 400);
      const address = getAddress(body.address);
      const origin = requestOrigin(request);
      const challenge = store.challenge(address, (nonce, expires) =>
        createSiweMessage({
          address,
          domain: new URL(origin).host,
          uri: origin,
          version: "1",
          chainId: monadChain.id,
          nonce,
          issuedAt: new Date(),
          expirationTime: new Date(expires),
          statement:
            "Verify your wallet to access MonliPay contacts and saved links. This does not authorize a payment or reveal your link decryption key.",
        }),
      );
      const response = json({ message: challenge.message });
      response.headers.append(
        "Set-Cookie",
        sessionCookie(CHALLENGE_COOKIE, challenge.token, 300),
      );
      return response;
    }
    if (
      body.action !== "verify" ||
      typeof body.signature !== "string" ||
      !isHex(body.signature)
    )
      return json({ error: "Invalid sign-in request." }, 400);
    const challenge = store.consumeChallenge(
      readCookie(request, CHALLENGE_COOKIE),
    );
    if (!challenge)
      return json({ error: "Sign-in expired. Please sign in again." }, 401);
    const client = createPublicClient({
      chain: monadChain,
      transport: http(undefined, { timeout: 10_000 }),
    });
    const valid = await client.verifyMessage({
      address: challenge.wallet,
      message: challenge.message,
      signature: body.signature,
    });
    if (!valid)
      return json({ error: "The signature does not match this wallet." }, 401);
    store.logout(readCookie(request, SESSION_COOKIE));
    const response = json({ address: challenge.wallet });
    response.headers.append(
      "Set-Cookie",
      sessionCookie(SESSION_COOKIE, store.session(challenge.wallet), 3600),
    );
    response.headers.append(
      "Set-Cookie",
      sessionCookie(CHALLENGE_COOKIE, "", 0),
    );
    return response;
  } catch (error) {
    console.error(
      "Contacts sign-in failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return json({ error: "Could not sign in. Please try again." }, 400);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
  } catch {
    return json({ error: "Request origin is not allowed." }, 403);
  }
  contactsStore().logout(readCookie(request, SESSION_COOKIE));
  const response = json({ ok: true });
  response.headers.append("Set-Cookie", sessionCookie(SESSION_COOKIE, "", 0));
  response.headers.append("Set-Cookie", sessionCookie(CHALLENGE_COOKIE, "", 0));
  return response;
}
