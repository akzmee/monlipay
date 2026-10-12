import { bytesToHex, hexToBytes } from "viem";
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
type PrfResult = {
  prf?: { enabled?: boolean; results?: { first: ArrayBuffer } };
};
const encoder = new TextEncoder();
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const hex = (b: Uint8Array) => bytesToHex(b).slice(2);
const bytes = (s: string) => Uint8Array.from(hexToBytes(`0x${s}`));
const b64 = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
const unb64 = (s: string) =>
  Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
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
function failure(error: unknown): never {
  if (
    error instanceof DOMException &&
    ["NotAllowedError", "AbortError"].includes(error.name)
  )
    throw new Error(
      "Passkey request cancelled or timed out. Your saved links are unchanged. Try again when ready.",
    );
  throw error;
}
function validateCredential(
  value: Credential | null,
  challenge: Uint8Array,
  type: string,
): PublicKeyCredential {
  if (!value || value.type !== "public-key")
    throw new Error("No passkey was selected. Try again.");
  const credential = value as PublicKeyCredential;
  const data = JSON.parse(
    new TextDecoder().decode(credential.response.clientDataJSON),
  );
  if (
    data.type !== type ||
    data.challenge !== b64(challenge) ||
    data.origin !== location.origin ||
    data.crossOrigin === true
  )
    throw new Error(
      "Passkey verification did not match this site. Please retry.",
    );
  return credential;
}
async function evaluate(
  credentialId: string,
  salt: string,
  signal?: AbortSignal,
) {
  available();
  const challenge = random(32);
  try {
    const credential = validateCredential(
      await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: location.hostname,
          timeout: 60_000,
          userVerification: "required",
          allowCredentials: [{ type: "public-key", id: unb64(credentialId) }],
          extensions: {
            prf: { eval: { first: bytes(salt) } },
          } as AuthenticationExtensionsClientInputs,
        },
        signal,
      }),
      challenge,
      "webauthn.get",
    );
    if (b64(new Uint8Array(credential.rawId)) !== credentialId)
      throw new Error("Choose the passkey used to save these links.");
    const flags = new Uint8Array(
      (credential.response as AuthenticatorAssertionResponse).authenticatorData,
    )[32];
    if (!(flags & 0x04))
      throw new Error(
        "Verify with your device screen lock to open saved links.",
      );
    const result = (credential.getClientExtensionResults() as PrfResult).prf
      ?.results?.first;
    if (!result || result.byteLength !== 32)
      throw new Error(
        "This passkey provider does not support encrypted links (PRF). Try a supported password manager or security key. Keep your original links.",
      );
    return new Uint8Array(result);
  } catch (error) {
    return failure(error);
  }
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
  const challenge = random(32);
  let credential: PublicKeyCredential;
  try {
    credential = validateCredential(
      await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { id: location.hostname, name: "MonliPay" },
          user: {
            id: random(32),
            name: `${scope.owner} · ${scope.chainId}`,
            displayName: `MonliPay ${scope.owner.slice(0, 6)}…${scope.owner.slice(-4)} · ${scope.chainId === 143 ? "Monad" : "Monad Testnet"}`,
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: {
            residentKey: "required",
            userVerification: "required",
          },
          attestation: "none",
          timeout: 60_000,
          extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
        },
        signal,
      }),
      challenge,
      "webauthn.create",
    );
  } catch (error) {
    return failure(error);
  }
  if (!(credential.getClientExtensionResults() as PrfResult).prf?.enabled)
    throw new Error(
      "This passkey provider cannot encrypt saved links (PRF). Try a supported password manager or security key. Nothing has been saved or replaced.",
    );
  const header = {
    credentialId: b64(new Uint8Array(credential.rawId)),
    salt: hex(random(32)),
  };
  // Read the credential back before persisting anything: no unopenable profile after a cancelled ceremony.
  const output = await evaluate(header.credentialId, header.salt, signal);
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
