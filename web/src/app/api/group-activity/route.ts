import { isAddress } from "viem";
import { monadChain } from "@/config/chain";
import { GROUP_VAULTS } from "@/config/group";
import { getGroupActivity } from "@/lib/envio-group-activity";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = getClientIp(request);
  // Without a trusted proxy, this bucket covers all visitors rather than one IP.
  if (!rateLimit(`group-activity:${ip}`, ip === "unknown" ? 600 : 60))
    return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  const params = new URL(request.url).searchParams;
  const vault = params.get("vault") ?? "";
  const id = params.get("id") ?? "";
  if (params.get("chain") !== String(monadChain.id) || !isAddress(vault) ||
      !GROUP_VAULTS.some((known) => known.toLowerCase() === vault.toLowerCase()) || !/^[1-9]\d{0,76}$/.test(id))
    return Response.json({ error: "This Group Payment link is not valid for this network." }, { status: 400 });
  try {
    const activity = await getGroupActivity(monadChain.id, vault, BigInt(id));
    return Response.json(activity, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Payment activity is temporarily unavailable. You can still use this link." }, { status: 503 });
  }
}
