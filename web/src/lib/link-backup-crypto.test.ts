import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  createBackupProfile,
  decryptLinkBackup,
  encryptLinkBackup,
  generateRecoveryKey,
  normalizeRecoveryKey,
  parseBackupLink,
  unlockBackupProfile,
} from "./link-backup-crypto";
import {
  parseBackupProfile,
  parseLinkBackup,
  type BackupScope,
} from "./link-backup-format";
import { buildShareableUrl, generateSecretKey } from "./crypto";
import {
  acknowledgeBackup,
  pendingBackups,
  queueBackup,
} from "./link-backup-outbox";

const scope: BackupScope = {
  owner: "0x1111111111111111111111111111111111111111",
  chainId: 10143,
  contract: "0x2222222222222222222222222222222222222222",
};
const origin = "https://testnet.monlipay.xyz";
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("encrypted Payment Link backups", () => {
  it("generates full-entropy recovery keys, accepts formatting, rejects wallet keys and weak input", () => {
    const key = generateRecoveryKey();
    expect(key).toMatch(/^MLP1-([0-9a-f]{8}-){7}[0-9a-f]{8}$/);
    expect(key).not.toBe(generateRecoveryKey());
    expect(normalizeRecoveryKey(` ${key.toUpperCase()} `)).toHaveLength(64);
    for (const bad of [
      "123456",
      "correct horse battery staple",
      "0x" + "aa".repeat(32),
      "MLP1-" + "z".repeat(64),
    ])
      expect(() => normalizeRecoveryKey(bad)).toThrow();
  });
  it("survives a new browser session with only the recovery key and ciphertext", async () => {
    const recovery = generateRecoveryKey();
    const { profile, key } = await createBackupProfile(recovery, scope);
    const secret = generateSecretKey();
    const backup = await encryptLinkBackup(key, scope, profile, "42", secret);
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
    expect(backup.ciphertext).toHaveLength(96);
    expect(JSON.stringify({ profile, backup })).not.toContain(secret.slice(2));
    expect(JSON.stringify({ profile, backup })).not.toContain(recovery);
    const restored = await unlockBackupProfile(
      recovery,
      scope,
      JSON.parse(JSON.stringify(profile)),
    );
    expect(
      await decryptLinkBackup(restored, scope, profile, backup, origin),
    ).toBe(buildShareableUrl(origin, 42n, secret));
  });
  it("uses a fresh nonce for every encryption of the same link", async () => {
    const { profile, key } = await createBackupProfile(
      generateRecoveryKey(),
      scope,
    );
    const secret = generateSecretKey();
    const a = await encryptLinkBackup(key, scope, profile, "1", secret);
    const b = await encryptLinkBackup(key, scope, profile, "1", secret);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });
  it("rejects the wrong recovery key, wallet, network and contract", async () => {
    const recovery = generateRecoveryKey();
    const { profile } = await createBackupProfile(recovery, scope);
    await expect(
      unlockBackupProfile(generateRecoveryKey(), scope, profile),
    ).rejects.toThrow("does not open");
    for (const wrong of [
      { ...scope, owner: scope.contract },
      { ...scope, chainId: 143 },
      { ...scope, contract: scope.owner },
    ])
      await expect(
        unlockBackupProfile(recovery, wrong, profile),
      ).rejects.toThrow("does not open");
  });
  it("authenticates ciphertext and binds it to the ID, claim key and vault", async () => {
    const { profile, key } = await createBackupProfile(
      generateRecoveryKey(),
      scope,
    );
    const backup = await encryptLinkBackup(
      key,
      scope,
      profile,
      "1",
      generateSecretKey(),
    );
    const flip = (s: string) => (s[0] === "0" ? "1" : "0") + s.slice(1);
    for (const tampered of [
      { ...backup, depositId: "2" },
      { ...backup, claimKey: scope.owner },
      { ...backup, ciphertext: flip(backup.ciphertext) },
      { ...backup, iv: flip(backup.iv) },
    ])
      await expect(
        decryptLinkBackup(key, scope, profile, tampered, origin),
      ).rejects.toThrow();
    await expect(
      decryptLinkBackup(
        key,
        scope,
        { ...profile, vaultId: flip(profile.vaultId) },
        backup,
        origin,
      ),
    ).rejects.toThrow();
  });
  it("allows legacy links but rejects a foreign network origin, unexpected query and invalid secrets", () => {
    const secret = generateSecretKey();
    expect(
      parseBackupLink(`${origin}/claim#42/${secret}`, origin).depositId,
    ).toBe(42n);
    expect(
      parseBackupLink(buildShareableUrl(origin, 42n, secret), origin).secretKey,
    ).toBe(secret);
    for (const bad of [
      `https://monlipay.xyz/claim#42/${secret}`,
      `${origin}/claim?a=1#42/${secret}`,
      `${origin}/claim#42/0x${"0".repeat(64)}`,
      `${origin}/lucky/claim?id=42`,
      `${origin}/claim#${2n ** 256n}/${secret}`,
    ])
      expect(() => parseBackupLink(bad, origin)).toThrow();
  });
  it("rejects unknown versions, extra plaintext fields and malformed envelopes", async () => {
    const { profile, key } = await createBackupProfile(
      generateRecoveryKey(),
      scope,
    );
    const backup = await encryptLinkBackup(
      key,
      scope,
      profile,
      "1",
      generateSecretKey(),
    );
    expect(() => parseBackupProfile({ ...profile, version: 2 })).toThrow();
    expect(() =>
      parseBackupProfile({ ...profile, recoveryKey: "secret" }),
    ).toThrow();
    for (const row of [
      { ...backup, url: "secret" },
      { ...backup, ciphertext: "00" },
      { ...backup, depositId: "01" },
      { ...backup, depositId: "-1" },
    ])
      expect(() => parseLinkBackup(row)).toThrow();
  });
  it("keeps only ciphertext in a wallet/network-scoped retry queue", async () => {
    const recovery = generateRecoveryKey();
    const { profile, key } = await createBackupProfile(recovery, scope);
    const secret = generateSecretKey();
    const backup = await encryptLinkBackup(key, scope, profile, "1", secret);
    expect(queueBackup(scope, profile, backup)).toBe(true);
    expect(pendingBackups(scope, profile)).toEqual([backup]);
    expect(
      pendingBackups({ ...scope, owner: scope.contract }, profile),
    ).toEqual([]);
    expect(pendingBackups({ ...scope, chainId: 143 }, profile)).toEqual([]);
    const serialized = localStorage.getItem(localStorage.key(0)!);
    expect(serialized).not.toContain(secret.slice(2));
    expect(serialized).not.toContain(recovery);
    acknowledgeBackup(scope, profile, "1");
    expect(pendingBackups(scope, profile)).toEqual([]);
  });
  it("reports unavailable local persistence instead of pretending a backup was queued", async () => {
    const { profile, key } = await createBackupProfile(
      generateRecoveryKey(),
      scope,
    );
    const backup = await encryptLinkBackup(
      key,
      scope,
      profile,
      "1",
      generateSecretKey(),
    );
    const set = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
    expect(queueBackup(scope, profile, backup)).toBe(false);
    set.mockRestore();
  });
});
