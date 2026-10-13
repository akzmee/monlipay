import { bytesToHex, hexToBytes } from "viem";
import { createRecordPasskey, readRecordPasskey } from "./mera-passkey";
import {
  createBackupProfile,
  generateRecoveryKey,
  normalizeRecoveryKey,
  unlockBackupProfile,
} from "./link-backup-crypto";
import {
  parseLinkPasskey,
  type BackupProfile,
  type BackupScope,
  type LinkPasskey,
} from "./link-backup-format";

// WebAuthn is an encryption ceremony here; wallet SIWE remains the server's authentication.
// The server receives neither the PRF result nor a WebAuthn assertion used as key material.
const encoder = new TextEncoder();
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const hex = (b: Uint8Array) => bytesToHex(b).slice(2);
const bytes = (s: string) => Uint8Array.from(hexToBytes(`0x${s}`));
const context = (
  scope: BackupScope,
  profile: BackupProfile,
  credentialId: string,
  origin: string,
) =>
  encoder.encode(
    JSON.stringify([
      "monlipay-passkey-wrap",
      1,
      origin,
      scope.owner.toLowerCase(),
      scope.chainId,
      scope.contract.toLowerCase(),
      profile.vaultId,
      credentialId,
    ]),
  );

export function supportsLinkPasskeys() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof PublicKeyCredential !== "undefined" &&
    !!navigator.credentials?.create &&
    !!navigator.credentials?.get
  );
}
function available() {
  if (!supportsLinkPasskeys())
    throw new Error(
      "Open MonliPay in a browser that supports passkeys. You can still create and share links without saving them.",
    );
}
async function evaluate(credentialId: string, salt: string, signal?: AbortSignal) {
  available();
  const { prfOutput } = await readRecordPasskey(credentialId, bytes(salt), signal);
  return prfOutput;
}
async function wrappingKey(
  output: Uint8Array<ArrayBuffer>,
  scope: BackupScope,
  profile: BackupProfile,
  passkey: Pick<LinkPasskey, "credentialId" | "salt">,
  origin: string,
) {
  const material = await crypto.subtle.importKey("raw", output, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: bytes(passkey.salt),
      info: context(scope, profile, passkey.credentialId, origin),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function wrapLinkRoot(
  recovery: string,
  output: Uint8Array<ArrayBuffer>,
  scope: BackupScope,
  profile: BackupProfile,
  header: Pick<LinkPasskey, "credentialId" | "salt">,
  origin: string,
): Promise<LinkPasskey> {
  const raw = bytes(normalizeRecoveryKey(recovery));
  try {
    const key = await wrappingKey(output, scope, profile, header, origin);
    const iv = random(12);
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: context(scope, profile, header.credentialId, origin),
      },
      key,
      raw,
    );
    return parseLinkPasskey({
      version: 1,
      ...header,
      iv: hex(iv),
      ciphertext: hex(new Uint8Array(ciphertext)),
    });
  } finally {
    raw.fill(0);
  }
}
export async function unwrapLinkRoot(
  output: Uint8Array<ArrayBuffer>,
  scope: BackupScope,
  profile: BackupProfile,
  value: LinkPasskey,
  origin: string,
): Promise<CryptoKey> {
  const passkey = parseLinkPasskey(value);
  let raw: Uint8Array | undefined;
  try {
    const key = await wrappingKey(output, scope, profile, passkey, origin);
    raw = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: bytes(passkey.iv),
          additionalData: context(scope, profile, passkey.credentialId, origin),
        },
        key,
        bytes(passkey.ciphertext),
      ),
    );
    return await unlockBackupProfile(`MLP1-${hex(raw)}`, scope, profile);
  } catch {
    throw new Error(
      "This passkey could not open your links. Use the original passkey and the same MonliPay site.",
    );
  } finally {
    raw?.fill(0);
  }
}

/** New users never handle a recovery string. Existing profiles migrate without rewriting any record. */
export async function createLinkPasskey(
  scope: BackupScope,
  existing?: { profile: BackupProfile; recovery: string },
  signal?: AbortSignal,
) {
  available();
  const recovery = existing?.recovery ?? generateRecoveryKey();
  const created = existing
    ? {
        profile: existing.profile,
        key: await unlockBackupProfile(recovery, scope, existing.profile),
      }
    : await createBackupProfile(recovery, scope);
  const salt = random(32);
  const credential = await createRecordPasskey(
    {
      name: `${scope.owner} · ${scope.chainId}`,
      displayName: `MonliPay ${scope.owner.slice(0, 6)}…${scope.owner.slice(-4)} · ${scope.chainId === 143 ? "Monad" : "Monad Testnet"}`,
    },
    salt,
    signal,
  );
  const header = { credentialId: credential.credentialId, salt: hex(salt) };
  const output = credential.prfOutput;
  try {
    const passkey = await wrapLinkRoot(
      recovery,
      output,
      scope,
      created.profile,
      header,
      location.origin,
    );
    const key = await unwrapLinkRoot(
      output,
      scope,
      created.profile,
      passkey,
      location.origin,
    );
    return { profile: created.profile, passkey, key };
  } finally {
    output.fill(0);
  }
}
export async function openWithLinkPasskey(
  scope: BackupScope,
  profile: BackupProfile,
  passkey: LinkPasskey,
  signal?: AbortSignal,
) {
  const output = await evaluate(passkey.credentialId, passkey.salt, signal);
  try {
    return await unwrapLinkRoot(
      output,
      scope,
      profile,
      passkey,
      location.origin,
    );
  } finally {
    output.fill(0);
  }
}
