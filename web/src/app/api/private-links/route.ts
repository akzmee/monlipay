import { LINK_VAULT_ADDRESS, monadChain } from "@/config/chain";
import { contactOwner, checkOrigin, json, readJson } from "@/lib/contacts-http";
import { linkBackupStore, BackupConflict } from "@/lib/link-backup-store";
import { privateRecordId } from "@/lib/private-record-format";
import { rateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function access(request: Request) {
  if (monadChain.id !== 143)
    return json({ error: "Private payments are available on mainnet." }, 404);
  const owner = contactOwner(request);
  if (!owner) return json({ error: "Verify your wallet first." }, 401);
  if (!rateLimit(`private-links:${owner.toLowerCase()}`, 120))
    return json({ error: "Try again in a minute." }, 429);
  return { owner, chainId: 143, contract: LINK_VAULT_ADDRESS };
}
export async function GET(request: Request) {
  const scope = access(request);
  if (scope instanceof Response) return scope;
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (id === null) {
      const store = linkBackupStore();
      return json({
        records: store
          .privateList(scope)
          .map((r) => store.privateGet(scope, r.id)),
      });
    }
    privateRecordId(id);
    const record = linkBackupStore().privateGet(scope, id);
    return record
      ? json({ record })
      : json({ error: "Private payment not found." }, 404);
  } catch {
    return json({ error: "Could not load private payments." }, 400);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
  } catch {
    return json({ error: "Request origin is not allowed." }, 403);
  }
  const scope = access(request);
  if (scope instanceof Response) return scope;
  try {
    const body = await readJson(request, 110_000);
    if (
      Object.keys(body).sort().join(",") !== "record,vaultId" ||
      typeof body.vaultId !== "string"
    )
      throw new Error();
    return json({
      record: linkBackupStore().privateSave(scope, body.vaultId, body.record),
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof BackupConflict
            ? error.message
            : "Could not save the encrypted payment. Reload before continuing.",
      },
      error instanceof BackupConflict ? 409 : 400,
    );
  }
}
