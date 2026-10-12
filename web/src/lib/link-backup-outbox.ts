import {
  parseLinkBackup,
  type BackupProfile,
  type BackupScope,
  type LinkBackup,
} from "./link-backup-format";

function prefix(s: BackupScope, p: BackupProfile) {
  return `monlipay:encrypted-backup:v1:${s.owner.toLowerCase()}:${s.chainId}:${s.contract.toLowerCase()}:${p.vaultId}:`;
}
/** Durable retry queue contains ciphertext ONLY. No decryption keys or claim URLs. */
export function queueBackup(
  scope: BackupScope,
  profile: BackupProfile,
  backup: LinkBackup,
): boolean {
  try {
    localStorage.setItem(
      prefix(scope, profile) + backup.depositId,
      JSON.stringify(parseLinkBackup(backup)),
    );
    return true;
  } catch {
    return false;
  }
}
export function pendingBackups(
  scope: BackupScope,
  profile: BackupProfile,
): LinkBackup[] {
  try {
    const start = prefix(scope, profile);
    const results: LinkBackup[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (!name?.startsWith(start)) continue;
      try {
        results.push(parseLinkBackup(JSON.parse(localStorage.getItem(name)!)));
      } catch {
        /* Ignore unrelated or corrupted storage. */
      }
    }
    return results;
  } catch {
    return [];
  }
}
export function acknowledgeBackup(
  scope: BackupScope,
  profile: BackupProfile,
  depositId: string,
) {
  try {
    localStorage.removeItem(prefix(scope, profile) + depositId);
  } catch {
    /* Retry remains safe. */
  }
}
