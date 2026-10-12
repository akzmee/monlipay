import { isAddress } from "viem";
import { contactsStore } from "@/lib/contacts-store";
import { checkOrigin, contactOwner, json, readJson } from "@/lib/contacts-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const owner = contactOwner(request);
  if (!owner)
    return json({ error: "Unlock contacts with your connected wallet." }, 401);
  return json({ contacts: contactsStore().list(owner) });
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
  } catch {
    return json({ error: "Request origin is not allowed." }, 403);
  }
  const owner = contactOwner(request);
  if (!owner)
    return json({ error: "Unlock contacts with your connected wallet." }, 401);
  try {
    const contact = contactsStore().save(owner, await readJson(request));
    return json({ contact });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Could not save contact.",
      },
      400,
    );
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
  } catch {
    return json({ error: "Request origin is not allowed." }, 403);
  }
  const owner = contactOwner(request);
  if (!owner)
    return json({ error: "Unlock contacts with your connected wallet." }, 401);
  try {
    const body = await readJson(request);
    if (typeof body.address !== "string" || !isAddress(body.address))
      throw new Error("Invalid wallet address.");
    contactsStore().remove(owner, body.address);
    return json({ ok: true });
  } catch {
    return json({ error: "Could not remove contact." }, 400);
  }
}
