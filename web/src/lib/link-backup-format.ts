/** Public envelope format. No claim secrets or recovery keys belong in these types. */
export type BackupScope = { owner: string; chainId: number; contract: string };
export type Sealed = { iv: string; ciphertext: string };
export type BackupProfile = {
  version: 1;
  vaultId: string;
  salt: string;
  check: Sealed;
};
export type LinkBackup = Sealed & { depositId: string; claimKey: string };
/** A passkey-wrapped random root. PRF output and plaintext root never leave the client. */
export type LinkPasskey = Sealed & {
  version: 1;
  credentialId: string;
  salt: string;
};
export type BackupSummary = Pick<LinkBackup, "depositId" | "claimKey"> & {
  createdAt: number;
};
export const MAX_LINK_BACKUPS = 5000;

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid backup format.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(",") !== keys.sort().join(","))
    throw new Error("Invalid backup fields.");
  return row;
}
function hex(value: unknown, length: number): string {
  if (
    typeof value !== "string" ||
    value.length !== length ||
    !/^[0-9a-f]+$/.test(value)
  )
    throw new Error("Invalid encrypted backup.");
  return value;
}
export function backupId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]{0,77})$/.test(value) ||
    BigInt(value) >= 2n ** 256n
  )
    throw new Error("Invalid payment link ID.");
  return value;
}
export function parseBackupProfile(value: unknown): BackupProfile {
  const row = object(value, ["version", "vaultId", "salt", "check"]);
  if (row.version !== 1) throw new Error("Unsupported backup version.");
  const check = object(row.check, ["iv", "ciphertext"]);
  return {
    version: 1,
    vaultId: hex(row.vaultId, 32),
    salt: hex(row.salt, 64),
    check: { iv: hex(check.iv, 24), ciphertext: hex(check.ciphertext, 96) },
  };
}
export function parseLinkBackup(value: unknown): LinkBackup {
  const row = object(value, ["depositId", "claimKey", "iv", "ciphertext"]);
  if (
    typeof row.claimKey !== "string" ||
    !/^0x[0-9a-f]{40}$/.test(row.claimKey)
  )
    throw new Error("Invalid claim address.");
  return {
    depositId: backupId(row.depositId),
    claimKey: row.claimKey,
    iv: hex(row.iv, 24),
    ciphertext: hex(row.ciphertext, 96),
  };
}

export function parseLinkPasskey(value: unknown): LinkPasskey {
  const row = object(value, [
    "version",
    "credentialId",
    "salt",
    "iv",
    "ciphertext",
  ]);
  if (
    row.version !== 1 ||
    typeof row.credentialId !== "string" ||
    !/^[A-Za-z0-9_-]{16,1364}$/.test(row.credentialId)
  )
    throw new Error("Invalid passkey envelope.");
  return {
    version: 1,
    credentialId: row.credentialId,
    salt: hex(row.salt, 64),
    iv: hex(row.iv, 24),
    ciphertext: hex(row.ciphertext, 96),
  };
}
