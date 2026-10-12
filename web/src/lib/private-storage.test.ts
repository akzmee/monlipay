import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { PrivateStorage } from "./private-storage";
import { createBackupProfile, generateRecoveryKey } from "./link-backup-crypto";
import { openPrivateRecord, sealPrivateRecord } from "./private-record-crypto";
import type { PrivateRecord } from "./private-record-format";
const scope = {
  owner: "0x1111111111111111111111111111111111111111",
  chainId: 143,
  contract: "0x2222222222222222222222222222222222222222",
};
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function setup() {
  const { profile, key } = await createBackupProfile(
    generateRecoveryKey(),
    scope,
  );
  const vault = {
    scope,
    profile,
    sealPrivate: (id: string, revision: number, value: unknown) =>
      sealPrivateRecord(key, scope, profile.vaultId, id, revision, value),
    openPrivate: (record: PrivateRecord) =>
      openPrivateRecord(key, scope, profile.vaultId, record),
  } as ConstructorParameters<typeof PrivateStorage>[0];
  return { vault, storage: new PrivateStorage(vault, () => {}), profile };
}
it("retains only encrypted intent on a lost save response, then retries identical ciphertext", async () => {
  const { storage } = await setup();
  const id = "ab".repeat(16),
    value = { secret: "bearer secret must stay local", status: "submitting" };
  let submitted: PrivateRecord | undefined;
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      submitted = JSON.parse(String(init.body)).record;
      throw Error("lost response");
    }
    return Response.json({ error: "missing" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(storage.save(id, 1, value)).rejects.toThrow();
  expect(localStorage.length).toBe(1);
  expect(localStorage.getItem(localStorage.key(0)!)).not.toContain(
    value.secret,
  );
  fetcher.mockImplementation(async (_url, init) =>
    init?.method === "POST"
      ? Response.json({ record: JSON.parse(String(init.body)).record })
      : Response.json({ error: "missing" }, { status: 404 }),
  );
  await storage.sync();
  expect(localStorage.length).toBe(0);
  const last = fetcher.mock.calls.at(-1)![1];
  expect(JSON.parse(String(last?.body)).record).toEqual(submitted);
});
it("recovers the immutable winning account after two tabs create different seeds", async () => {
  const { storage, vault } = await setup();
  const winning = { seed: "first-account" };
  const current = await vault.sealPrivate("sender-v1", 1, winning);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) =>
      init?.method === "POST"
        ? Response.json({ error: "conflict" }, { status: 409 })
        : Response.json({ record: current }),
    ),
  );
  await expect(
    storage.save("sender-v1", 1, { seed: "losing-account" }),
  ).rejects.toThrow("another session");
  expect((await storage.recoverAccount())?.value).toEqual(winning);
  expect(localStorage.length).toBe(0);
  expect(await storage.get("sender-v1")).toMatchObject({ value: winning });
});
it("rejects a mismatched server acknowledgement and keeps the encrypted recovery record", async () => {
  const { storage, vault } = await setup(),
    id = "cd".repeat(16);
  const different = await vault.sealPrivate(id, 1, { recipient: "other" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ record: different })),
  );
  await expect(storage.save(id, 1, { recipient: "intended" })).rejects.toThrow(
    "does not match",
  );
  expect(localStorage.length).toBe(1);
});
it("stops before encryption or network access when the wallet session locks", async () => {
  const { vault } = await setup();
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const storage = new PrivateStorage(vault, () => {
    throw Error("locked");
  });
  await expect(
    storage.save("ab".repeat(16), 1, { seed: "secret" }),
  ).rejects.toThrow("locked");
  expect(fetcher).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
});
