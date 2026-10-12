import { bytesToHex, hexToBytes, type Hex } from "viem";
import {
  buildShareableUrl,
  parseClaimUrl,
  privateKeyToClaimKey,
} from "./crypto";
import {
  backupId,
  parseBackupProfile,
  parseLinkBackup,
  type BackupProfile,
  type BackupScope,
  type LinkBackup,
  type Sealed,
} from "./link-backup-format";

const encoder = new TextEncoder();
const CHECK = encoder.encode("MonliPay backup key check v1...."); // exactly 32 bytes
const bytes = (s: string) => Uint8Array.from(hexToBytes(`0x${s}`));
const hex = (b: Uint8Array) => bytesToHex(b).slice(2);
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const context = (
  scope: BackupScope,
  vaultId: string,
  purpose: string,
  ...extra: string[]
) =>
  encoder.encode(
    JSON.stringify([
      "monlipay-link-backup",
      1,
      scope.owner.toLowerCase(),
      scope.chainId,
      scope.contract.toLowerCase(),
      vaultId,
      purpose,
      ...extra,
    ]),
  );

/** 256 bits of browser-generated entropy. This is NOT a wallet seed or wallet private key. */
export function generateRecoveryKey(): string {
  if (!crypto.subtle)
    throw new Error(
      "Encrypted backups need HTTPS and a browser with Web Crypto support.",
    );
  return `MLP1-${hex(random(32)).match(/.{8}/g)!.join("-")}`;
}
export function normalizeRecoveryKey(value: string): string {
  const key = value.trim().replace(/[\s-]/g, "").toLowerCase();
  if (!/^mlp1[0-9a-f]{64}$/.test(key))
    throw new Error(
      "Enter the complete MonliPay recovery key beginning with MLP1. Do not enter your wallet seed phrase.",
    );
  return key.slice(4);
}
async function derive(
  recovery: string,
  scope: BackupScope,
  profile: Pick<BackupProfile, "salt" | "vaultId">,
): Promise<CryptoKey> {
  if (!crypto.subtle)
    throw new Error(
      "Encrypted backups need HTTPS and a browser with Web Crypto support.",
    );
  const raw = bytes(normalizeRecoveryKey(recovery));
  try {
    const source = await crypto.subtle.importKey("raw", raw, "HKDF", false, [
      "deriveKey",
    ]);
    return await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: bytes(profile.salt),
        info: context(scope, profile.vaultId, "key"),
      },
      source,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    raw.fill(0);
  }
}
async function seal(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
  aad: Uint8Array<ArrayBuffer>,
): Promise<Sealed> {
  const iv = random(12);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad, tagLength: 128 },
    key,
    plaintext,
  );
  return { iv: hex(iv), ciphertext: hex(new Uint8Array(encrypted)) };
}
async function unseal(
  key: CryptoKey,
  box: Sealed,
  aad: Uint8Array<ArrayBuffer>,
) {
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes(box.iv),
        additionalData: aad,
        tagLength: 128,
      },
      key,
      bytes(box.ciphertext),
    ),
  );
}
export async function createBackupProfile(
  recovery: string,
  scope: BackupScope,
) {
  const header = {
    version: 1 as const,
    vaultId: hex(random(16)),
    salt: hex(random(32)),
  };
  const key = await derive(recovery, scope, header);
  const profile = parseBackupProfile({
    ...header,
    check: await seal(key, CHECK, context(scope, header.vaultId, "check")),
  });
  return { profile, key };
}
export async function unlockBackupProfile(
  recovery: string,
  scope: BackupScope,
  value: BackupProfile,
): Promise<CryptoKey> {
  const profile = parseBackupProfile(value);
  const key = await derive(recovery, scope, profile);
  try {
    const check = await unseal(
      key,
      profile.check,
      context(scope, profile.vaultId, "check"),
    );
    if (hex(check) !== hex(CHECK)) throw new Error();
    return key;
  } catch {
    throw new Error(
      "This recovery key does not open these backups. Check the key, wallet and network.",
    );
  }
}
export function parseBackupLink(url: string, origin: string) {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error("Paste a complete MonliPay payment link.");
  }
  if (
    parsed.origin !== origin ||
    parsed.pathname !== "/claim" ||
    parsed.search ||
    parsed.username ||
    parsed.password ||
    url.length > 1024
  )
    throw new Error("Use a payment link from this MonliPay network.");
  const claim = parseClaimUrl(parsed.hash);
  if (!claim) throw new Error("This link is missing its claim key.");
  backupId(claim.depositId.toString());
  let claimKey: string;
  try {
    claimKey = privateKeyToClaimKey(claim.secretKey).toLowerCase();
  } catch {
    throw new Error("This link has an invalid claim key.");
  }
  return { ...claim, claimKey };
}
export async function encryptLinkBackup(
  key: CryptoKey,
  scope: BackupScope,
  profile: BackupProfile,
  depositId: string,
  secretKey: Hex,
): Promise<LinkBackup> {
  backupId(depositId);
  const claimKey = privateKeyToClaimKey(secretKey).toLowerCase();
  const raw = Uint8Array.from(hexToBytes(secretKey));
  try {
    return {
      depositId,
      claimKey,
      ...(await seal(
        key,
        raw,
        context(scope, profile.vaultId, "link", depositId, claimKey),
      )),
    };
  } finally {
    raw.fill(0);
  }
}
export async function decryptLinkBackup(
  key: CryptoKey,
  scope: BackupScope,
  profile: BackupProfile,
  value: LinkBackup,
  origin: string,
): Promise<string> {
  const row = parseLinkBackup(value);
  let plaintext: Uint8Array<ArrayBuffer> | undefined;
  try {
    plaintext = await unseal(
      key,
      row,
      context(scope, profile.vaultId, "link", row.depositId, row.claimKey),
    );
    const secret = bytesToHex(plaintext);
    if (privateKeyToClaimKey(secret).toLowerCase() !== row.claimKey)
      throw new Error();
    return buildShareableUrl(origin, BigInt(row.depositId), secret);
  } catch {
    throw new Error(
      "This backup could not be verified. Keep your original link and retry after unlocking.",
    );
  } finally {
    plaintext?.fill(0);
  }
}
