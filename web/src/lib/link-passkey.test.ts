import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  createBackupProfile,
  encryptLinkBackup,
  decryptLinkBackup,
  generateRecoveryKey,
} from "./link-backup-crypto";
import {
  createLinkPasskey,
  openWithLinkPasskey,
  wrapLinkRoot,
  unwrapLinkRoot,
} from "./link-passkey";
import { generateSecretKey } from "./crypto";
const scope = {
  owner: "0x1111111111111111111111111111111111111111",
  chainId: 10143,
  contract: "0x2222222222222222222222222222222222222222",
};
const credentialId = new Uint8Array(32).fill(3);
const output = new Uint8Array(32).fill(7);
const b64 = (value: Uint8Array) => Buffer.from(value).toString("base64url");
const header = { credentialId: b64(credentialId), salt: "ab".repeat(32) };
let supported: boolean;
let create: ReturnType<
  typeof vi.fn<
    (options: CredentialCreationOptions) => Promise<PublicKeyCredential>
  >
>;
let get: ReturnType<
  typeof vi.fn<
    (options: CredentialRequestOptions) => Promise<PublicKeyCredential>
  >
>;
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("PublicKeyCredential", class {});
  vi.stubGlobal("isSecureContext", true);
  supported = true;
  const make = (
    options: CredentialCreationOptions | CredentialRequestOptions,
    type: string,
  ) => {
    const publicKey = options.publicKey!;
    const flags = new Uint8Array(37);
    flags[32] = 5;
    return {
      type: "public-key",
      rawId: credentialId.buffer,
      response: {
        clientDataJSON: new TextEncoder().encode(
          JSON.stringify({
            type,
            challenge: b64(new Uint8Array(publicKey.challenge as ArrayBuffer)),
            origin: location.origin,
          }),
        ),
        authenticatorData: flags.buffer,
      },
      getClientExtensionResults: () => ({
        prf: supported
          ? { enabled: true, results: { first: output.slice().buffer } }
          : {},
      }),
    } as unknown as PublicKeyCredential;
  };
  create = vi.fn(async (options) => make(options, "webauthn.create"));
  get = vi.fn(async (options) => make(options, "webauthn.get"));
  Object.defineProperty(navigator, "credentials", {
    configurable: true,
    value: { create, get },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("passkey-protected saved links", () => {
  it("creates without a user-saved recovery string, verifies readback, and opens the same claim key", async () => {
    const created = await createLinkPasskey(scope);
    expect(create).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(created.key.extractable).toBe(false);
    expect(Object.keys(created).sort()).toEqual(["key", "passkey", "profile"]);
    const secret = generateSecretKey();
    const record = await encryptLinkBackup(
      created.key,
      scope,
      created.profile,
      "12",
      secret,
    );
    const reopened = await openWithLinkPasskey(
      scope,
      created.profile,
      created.passkey,
    );
    const url = await decryptLinkBackup(
      reopened,
      scope,
      created.profile,
      record,
      location.origin,
    );
    expect(url).toContain("/claim#");
    expect(
      JSON.stringify({
        profile: created.profile,
        passkey: created.passkey,
        record,
      }),
    ).not.toContain(secret.slice(2));
    expect(JSON.stringify(created.passkey)).not.toContain(
      Buffer.from(output).toString("hex"),
    );
  });
  it("migrates the existing profile and ciphertext without rotating the encryption key", async () => {
    const recovery = generateRecoveryKey();
    const original = await createBackupProfile(recovery, scope);
    const record = await encryptLinkBackup(
      original.key,
      scope,
      original.profile,
      "5",
      generateSecretKey(),
    );
    const before = await decryptLinkBackup(
      original.key,
      scope,
      original.profile,
      record,
      location.origin,
    );
    const migrated = await createLinkPasskey(scope, {
      profile: original.profile,
      recovery,
    });
    expect(migrated.profile).toEqual(original.profile);
    const reopened = await openWithLinkPasskey(
      scope,
      migrated.profile,
      migrated.passkey,
    );
    expect(
      await decryptLinkBackup(
        reopened,
        scope,
        migrated.profile,
        record,
        location.origin,
      ),
    ).toBe(before);
    expect(JSON.stringify(migrated.passkey)).not.toContain(
      recovery.replaceAll("-", "").slice(4),
    );
  });
  it("refuses an incorrect legacy key before asking to create a passkey", async () => {
    const { profile } = await createBackupProfile(generateRecoveryKey(), scope);
    await expect(
      createLinkPasskey(scope, { profile, recovery: generateRecoveryKey() }),
    ).rejects.toThrow("does not open");
    expect(create).not.toHaveBeenCalled();
  });
  it("opens a pre-Mera passkey envelope using its original PRF salt", async () => {
    const recovery = generateRecoveryKey();
    const original = await createBackupProfile(recovery, scope);
    const record = await encryptLinkBackup(original.key, scope, original.profile, "8", generateSecretKey());
    const envelope = await wrapLinkRoot(recovery, output.slice(), scope, original.profile, header, location.origin);
    const reopened = await openWithLinkPasskey(scope, original.profile, envelope);
    const extensions = get.mock.calls[0][0].publicKey!.extensions as { prf: { eval: { first: Uint8Array } } };
    expect(Buffer.from(extensions.prf.eval.first).toString("hex")).toBe(header.salt);
    expect(create).not.toHaveBeenCalled();
    expect(await decryptLinkBackup(reopened, scope, original.profile, record, location.origin))
      .toBe(await decryptLinkBackup(original.key, scope, original.profile, record, location.origin));
  });
  it("binds wrapped roots to the wallet, chain, vault, site, profile and credential", async () => {
    const recovery = generateRecoveryKey();
    const { profile } = await createBackupProfile(recovery, scope);
    const envelope = await wrapLinkRoot(
      recovery,
      output.slice(),
      scope,
      profile,
      header,
      location.origin,
    );
    for (const changed of [
      { ...scope, owner: scope.contract },
      { ...scope, chainId: 143 },
      { ...scope, contract: scope.owner },
    ])
      await expect(
        unwrapLinkRoot(
          output.slice(),
          changed,
          profile,
          envelope,
          location.origin,
        ),
      ).rejects.toThrow("could not open");
    await expect(
      unwrapLinkRoot(
        output.slice(),
        scope,
        profile,
        envelope,
        "https://other.example",
      ),
    ).rejects.toThrow();
    await expect(
      unwrapLinkRoot(
        output.slice(),
        scope,
        { ...profile, vaultId: "ff".repeat(16) },
        envelope,
        location.origin,
      ),
    ).rejects.toThrow();
    await expect(
      unwrapLinkRoot(
        output.slice(),
        scope,
        profile,
        { ...envelope, credentialId: b64(new Uint8Array(32).fill(4)) },
        location.origin,
      ),
    ).rejects.toThrow();
    await expect(
      unwrapLinkRoot(
        new Uint8Array(32).fill(8),
        scope,
        profile,
        envelope,
        location.origin,
      ),
    ).rejects.toThrow();
    await expect(
      unwrapLinkRoot(
        output.slice(),
        scope,
        profile,
        { ...envelope, ciphertext: "00".repeat(48) },
        location.origin,
      ),
    ).rejects.toThrow();
  });
  it("fails explicitly for unsupported PRF and a cancelled readback without producing a profile", async () => {
    supported = false;
    await expect(createLinkPasskey(scope)).rejects.toThrow("cannot encrypt");
    expect(get).not.toHaveBeenCalled();
    supported = true;
    get.mockRejectedValue(new DOMException("cancelled", "NotAllowedError"));
    await expect(createLinkPasskey(scope)).rejects.toThrow(
      "cancelled or timed out",
    );
  });
  it("requires device verification and the expected challenge/origin/credential", async () => {
    const good = await createLinkPasskey(scope);
    get.mockImplementationOnce(
      async () =>
        ({
          type: "public-key",
          rawId: credentialId.buffer,
          response: {
            clientDataJSON: new TextEncoder().encode(
              JSON.stringify({
                type: "webauthn.get",
                challenge: "wrong",
                origin: location.origin,
              }),
            ),
          },
        }) as unknown as PublicKeyCredential,
    );
    await expect(
      openWithLinkPasskey(scope, good.profile, good.passkey),
    ).rejects.toThrow("did not match");
    const original = get.getMockImplementation()!;
    get.mockImplementationOnce(async (options) => {
      const value = await original(options);
      Object.defineProperty(value.response, "authenticatorData", {
        value: new Uint8Array(37).buffer,
      });
      return value;
    });
    await expect(
      openWithLinkPasskey(scope, good.profile, good.passkey),
    ).rejects.toThrow("device screen lock");
  });
});
