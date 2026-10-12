import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LinkBackupStore } from "./link-backup-store";
import { createBackupProfile, generateRecoveryKey } from "./link-backup-crypto";
import { sealPrivateRecord, openPrivateRecord } from "./private-record-crypto";
import { parsePrivateRecord } from "./private-record-format";
import { claimJournal } from "./private-claim-journal";
const scope = {
  owner: "0x1111111111111111111111111111111111111111",
  chainId: 143,
  contract: "0x2222222222222222222222222222222222222222",
};
const passkey = {
  version: 1,
  credentialId: "a".repeat(43),
  salt: "11".repeat(32),
  iv: "22".repeat(12),
  ciphertext: "33".repeat(48),
};
let store: LinkBackupStore;
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  store = new LinkBackupStore(":memory:");
  localStorage.clear();
});
afterEach(() => {
  store.close();
  vi.unstubAllGlobals();
});
async function setup() {
  const { profile, key } = await createBackupProfile(
    generateRecoveryKey(),
    scope,
  );
  store.savePasskey(scope, profile, passkey);
  return { profile, key };
}
it("authenticates wallet, network, vault, record ID and revision without exposing the seed", async () => {
  const { profile, key } = await setup(),
    value = { version: 1, seed: "0x" + "77".repeat(32) };
  const record = await sealPrivateRecord(
    key,
    scope,
    profile.vaultId,
    "sender-v1",
    1,
    value,
  );
  expect(JSON.stringify(record)).not.toContain(value.seed);
  expect(await openPrivateRecord(key, scope, profile.vaultId, record)).toEqual(
    value,
  );
  for (const other of [
    { ...scope, owner: scope.contract },
    { ...scope, chainId: 10143 },
    { ...scope, contract: scope.owner },
  ])
    await expect(
      openPrivateRecord(key, other, profile.vaultId, record),
    ).rejects.toThrow();
  await expect(
    openPrivateRecord(key, scope, "ab".repeat(16), record),
  ).rejects.toThrow();
  await expect(
    openPrivateRecord(key, scope, profile.vaultId, { ...record, revision: 2 }),
  ).rejects.toThrow();
  await expect(
    openPrivateRecord(key, scope, profile.vaultId, {
      ...record,
      id: "ab".repeat(16),
      kind: "operation",
    }),
  ).rejects.toThrow();
});
it("makes the account immutable and operation writes compare-and-swap with idempotent retry", async () => {
  const { profile, key } = await setup();
  const account = await sealPrivateRecord(
    key,
    scope,
    profile.vaultId,
    "sender-v1",
    1,
    { seed: "fixture" },
  );
  expect(store.privateSave(scope, profile.vaultId, account)).toEqual(account);
  expect(store.privateSave(scope, profile.vaultId, account)).toEqual(account);
  const changed = await sealPrivateRecord(
    key,
    scope,
    profile.vaultId,
    "sender-v1",
    2,
    { seed: "replacement" },
  );
  expect(() => store.privateSave(scope, profile.vaultId, changed)).toThrow(
    "another session",
  );
  const id = "12".repeat(16),
    first = await sealPrivateRecord(key, scope, profile.vaultId, id, 1, {
      status: "submitting",
    });
  store.privateSave(scope, profile.vaultId, first);
  const second = await sealPrivateRecord(key, scope, profile.vaultId, id, 2, {
    status: "pending",
    requestId: "fixture",
  });
  store.privateSave(scope, profile.vaultId, second);
  const conflict = await sealPrivateRecord(key, scope, profile.vaultId, id, 2, {
    status: "failed",
  });
  expect(() => store.privateSave(scope, profile.vaultId, conflict)).toThrow(
    "another session",
  );
  expect(() => store.privateSave(scope, profile.vaultId, first)).toThrow(
    "another session",
  );
  expect(store.privateGet(scope, id)).toEqual(second);
  expect(store.privateList(scope).find((r) => r.id === id)?.revision).toBe(2);
});
it("requires a mainnet passkey and isolates encrypted records by wallet and contract", async () => {
  const { profile, key } = await setup(),
    record = await sealPrivateRecord(
      key,
      scope,
      profile.vaultId,
      "sender-v1",
      1,
      { fixture: true },
    );
  store.privateSave(scope, profile.vaultId, record);
  for (const other of [
    { ...scope, owner: scope.contract },
    { ...scope, chainId: 10143 },
    { ...scope, contract: scope.owner },
  ]) {
    expect(store.privateList(other)).toEqual([]);
    expect(store.privateGet(other, record.id)).toBeNull();
    expect(() => store.privateSave(other, profile.vaultId, record)).toThrow();
  }
  const other = new LinkBackupStore(":memory:");
  try {
    other.create(scope, profile);
    expect(() => other.privateSave(scope, profile.vaultId, record)).toThrow(
      "passkey",
    );
  } finally {
    other.close();
  }
});
it("persists recoverable state across database reopen", async () => {
  const { profile, key } = await setup(),
    record = await sealPrivateRecord(
      key,
      scope,
      profile.vaultId,
      "sender-v1",
      1,
      { fixture: true },
    );
  const dir = mkdtempSync(join(tmpdir(), "monlipay-private-record-")),
    path = join(dir, "links.sqlite");
  const a = new LinkBackupStore(path);
  a.savePasskey(scope, profile, passkey);
  a.privateSave(scope, profile.vaultId, record);
  a.close();
  const b = new LinkBackupStore(path);
  try {
    expect(
      await openPrivateRecord(
        key,
        scope,
        profile.vaultId,
        b.privateGet(scope, "sender-v1")!,
      ),
    ).toEqual({ fixture: true });
  } finally {
    b.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
it("rejects plaintext fields, oversized ciphertext, malformed IDs and revision overflow", () => {
  const valid = {
    id: "aa".repeat(16),
    kind: "operation",
    revision: 1,
    iv: "11".repeat(12),
    ciphertext: "22".repeat(32),
  };
  for (const bad of [
    { ...valid, seed: "secret" },
    { ...valid, id: "../private" },
    { ...valid, revision: 201 },
    { ...valid, revision: 1.5 },
    { ...valid, ciphertext: "00".repeat(50_000) },
  ])
    expect(() => parsePrivateRecord(bad)).toThrow();
});
it("encrypts recipient claim progress and recovers it using the same bearer secret", async () => {
  const seed = new Uint8Array(32).fill(7),
    token = scope.contract,
    origin = "https://monlipay.xyz";
  const op = {
    version: 1 as const,
    id: "ab".repeat(16),
    kind: "withdraw" as const,
    status: "pending" as const,
    token: token as `0x${string}`,
    amount: "100",
    createdAt: Date.now(),
    recipient: scope.owner as `0x${string}`,
    requestId: "11111111-2222-4333-8444-555555555555",
  };
  const first = await claimJournal(seed, token, origin);
  await first.save(op);
  expect(JSON.stringify(localStorage)).not.toContain("11111111-2222-4333-8444-555555555555");
  expect(await (await claimJournal(seed, token, origin)).read()).toEqual(op);
  expect(
    await (
      await claimJournal(new Uint8Array(32).fill(8), token, origin)
    ).read(),
  ).toBeNull();
  await expect(
    (await claimJournal(seed, token, "https://other.example")).read(),
  ).rejects.toThrow();
});
