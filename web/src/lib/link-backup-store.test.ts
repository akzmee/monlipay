import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LinkBackupStore } from "./link-backup-store";
import {
  createBackupProfile,
  encryptLinkBackup,
  generateRecoveryKey,
} from "./link-backup-crypto";
import { generateSecretKey } from "./crypto";
import type { BackupScope } from "./link-backup-format";
const scope: BackupScope = {
  owner: "0x1111111111111111111111111111111111111111",
  chainId: 10143,
  contract: "0x2222222222222222222222222222222222222222",
};
let store: LinkBackupStore;
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  store = new LinkBackupStore(":memory:");
});
afterEach(() => {
  store.close();
  vi.unstubAllGlobals();
});
async function seed() {
  const { profile, key } = await createBackupProfile(
    generateRecoveryKey(),
    scope,
  );
  const backup = await encryptLinkBackup(
    key,
    scope,
    profile,
    "42",
    generateSecretKey(),
  );
  store.create(scope, profile);
  store.save(scope, profile.vaultId, backup);
  return { profile, key, backup };
}
describe("durable encrypted storage", () => {
  it("isolates wallets, networks and contracts on reads and writes", async () => {
    const { profile, backup } = await seed();
    for (const other of [
      { ...scope, owner: scope.contract },
      { ...scope, chainId: 143 },
      { ...scope, contract: scope.owner },
    ]) {
      expect(store.profile(other)).toBeNull();
      expect(store.list(other)).toEqual([]);
      expect(store.get(other, "42")).toBeNull();
      expect(() => store.save(other, profile.vaultId, backup)).toThrow();
    }
    expect(store.get(scope, "42")).toEqual(backup);
  });
  it("is idempotent after an acknowledged write response is lost", async () => {
    const { profile, backup } = await seed();
    expect(store.create(scope, profile)).toEqual(profile);
    expect(store.save(scope, profile.vaultId, backup)).toEqual(backup);
    expect(store.list(scope)).toHaveLength(1);
  });
  it("never silently replaces the recovery profile or an existing claim backup", async () => {
    const { profile, backup } = await seed();
    const other = await createBackupProfile(generateRecoveryKey(), scope);
    expect(() => store.create(scope, other.profile)).toThrow("already set up");
    expect(() =>
      store.save(scope, profile.vaultId, {
        ...backup,
        ciphertext: "00".repeat(48),
      }),
    ).toThrow("already exists");
    expect(store.get(scope, "42")).toEqual(backup);
  });
  it("rejects reused nonces and a stale profile", async () => {
    const { profile, backup } = await seed();
    expect(() => store.save(scope, "ff".repeat(16), backup)).toThrow("changed");
    expect(() =>
      store.save(scope, profile.vaultId, { ...backup, depositId: "43" }),
    ).toThrow();
    expect(() =>
      store.save(scope, profile.vaultId, {
        ...backup,
        depositId: "44",
        iv: profile.check.iv,
      }),
    ).toThrow("nonce");
  });
  it("survives a server restart", async () => {
    const { profile, backup } = await seed();
    const dir = mkdtempSync(join(tmpdir(), "monlipay-backups-"));
    const path = join(dir, "backups.sqlite");
    const a = new LinkBackupStore(path);
    a.create(scope, profile);
    a.save(scope, profile.vaultId, backup);
    a.close();
    const b = new LinkBackupStore(path);
    try {
      expect(b.profile(scope)).toEqual(profile);
      expect(b.get(scope, "42")).toEqual(backup);
    } finally {
      b.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("passkey persistence", () => {
  const envelope = {
    version: 1,
    credentialId: "a".repeat(43),
    salt: "11".repeat(32),
    iv: "22".repeat(12),
    ciphertext: "33".repeat(48),
  };
  it("commits a new profile and wrapped root together, with idempotent retries", async () => {
    const { profile } = await createBackupProfile(generateRecoveryKey(), scope);
    expect(() =>
      store.savePasskey(scope, profile, {
        ...envelope,
        plaintext: "forbidden",
      }),
    ).toThrow();
    expect(store.profile(scope)).toBeNull();
    expect(store.passkey(scope)).toBeNull();
    store.savePasskey(scope, profile, envelope);
    store.savePasskey(scope, profile, envelope);
    expect(store.profile(scope)).toEqual(profile);
    expect(store.passkey(scope)).toEqual(envelope);
    expect(store.hasLegacyRecovery(scope)).toBe(false);
    expect(store.passkey({ ...scope, chainId: 143 })).toBeNull();
    expect(store.passkey({ ...scope, owner: scope.contract })).toBeNull();
  });
  it("preserves legacy records and recovery access through migration", async () => {
    const { profile, backup } = await seed();
    expect(store.hasLegacyRecovery(scope)).toBe(true);
    store.savePasskey(scope, profile, envelope);
    expect(store.hasLegacyRecovery(scope)).toBe(true);
    expect(store.get(scope, "42")).toEqual(backup);
    expect(store.profile(scope)).toEqual(profile);
    expect(() =>
      store.savePasskey(scope, profile, {
        ...envelope,
        ciphertext: "ff".repeat(48),
      }),
    ).toThrow("already connected");
    const changed = await createBackupProfile(generateRecoveryKey(), scope);
    expect(() => store.savePasskey(scope, changed.profile, envelope)).toThrow(
      "different key",
    );
    expect(store.get(scope, "42")).toEqual(backup);
  });
});
