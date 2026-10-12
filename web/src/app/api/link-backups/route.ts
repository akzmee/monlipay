import { LINK_VAULT_ADDRESS, monadChain } from "@/config/chain";
import { checkOrigin, contactOwner, json, readJson } from "@/lib/contacts-http";
import { BackupConflict, linkBackupStore } from "@/lib/link-backup-store";
import { rateLimit } from "@/lib/rate-limit";
import {
  backupId,
  parseLinkBackup,
  type BackupScope,
} from "@/lib/link-backup-format";
import { createPublicClient, http } from "viem";
import { linkVaultAbi } from "@/lib/abi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function access(request: Request): BackupScope | Response {
  const owner = contactOwner(request);
  if (!owner)
    return json({ error: "Verify your wallet to access saved links." }, 401);
  if (!rateLimit(`link-backups:${owner.toLowerCase()}`, 120))
    return json(
      { error: "Too many saved-link requests. Try again in a minute." },
      429,
    );
  return { owner, chainId: monadChain.id, contract: LINK_VAULT_ADDRESS };
}
export async function GET(request: Request) {
  try {
    const scope = access(request);
    if (scope instanceof Response) return scope;
    const store = linkBackupStore();
    const depositId = new URL(request.url).searchParams.get("depositId");
    if (depositId !== null) {
      try {
        backupId(depositId);
      } catch {
        return json({ error: "Invalid payment link ID." }, 400);
      }
      const backup = store.get(scope, depositId);
      return backup
        ? json({ backup })
        : json({ error: "This link has not been saved." }, 404);
    }
    return json({
      profile: store.profile(scope),
      passkey: store.passkey(scope),
      legacyRecovery: store.hasLegacyRecovery(scope),
      links: store.list(scope),
    });
  } catch {
    return json({ error: "Could not load saved links. Please retry." }, 503);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
  } catch {
    return json({ error: "Request origin is not allowed." }, 403);
  }
  try {
    const scope = access(request);
    if (scope instanceof Response) return scope;
    const body = await readJson(request);
    const store = linkBackupStore();
    if (
      body.action === "passkey" &&
      Object.keys(body).sort().join(",") === "action,passkey,profile"
    )
      return json(store.savePasskey(scope, body.profile, body.passkey));
    if (
      body.action === "setup" &&
      Object.keys(body).sort().join(",") === "action,profile"
    )
      return json({ profile: store.create(scope, body.profile) });
    if (
      body.action === "save" &&
      Object.keys(body).sort().join(",") === "action,backup,vaultId" &&
      typeof body.vaultId === "string"
    ) {
      const backup = parseLinkBackup(body.backup);
      const client = createPublicClient({
        chain: monadChain,
        transport: http(undefined, { timeout: 10_000, retryCount: 1 }),
      });
      let deposit;
      try {
        deposit = await client.readContract({
          address: LINK_VAULT_ADDRESS,
          abi: linkVaultAbi,
          functionName: "getDeposit",
          args: [BigInt(backup.depositId)],
        });
      } catch {
        return json(
          {
            error:
              "Could not verify this payment onchain. Keep the original link and retry.",
          },
          503,
        );
      }
      if (
        deposit.sender.toLowerCase() !== scope.owner.toLowerCase() ||
        deposit.claimKey.toLowerCase() !== backup.claimKey
      )
        return json(
          {
            error:
              "This payment link does not belong to this wallet or claim key.",
          },
          403,
        );
      return json({ backup: store.save(scope, body.vaultId, backup) });
    }
    return json({ error: "Invalid backup request." }, 400);
  } catch (e) {
    if (e instanceof BackupConflict) return json({ error: e.message }, 409);
    // Never include request bodies, credentials, ciphertext, or raw exception messages in logs.
    return json(
      {
        error:
          "Could not save this encrypted link. Keep the original link and retry.",
      },
      400,
    );
  }
}
