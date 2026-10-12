import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { ContactsStore } from "@/lib/contacts-store";
import * as contacts from "@/lib/contacts-store";
import { LinkBackupStore } from "@/lib/link-backup-store";
import * as backups from "@/lib/link-backup-store";
import {
  createBackupProfile,
  encryptLinkBackup,
  generateRecoveryKey,
} from "@/lib/link-backup-crypto";
import { generateSecretKey } from "@/lib/crypto";
import { SESSION_COOKIE } from "@/lib/contacts-http";
import { _resetRateLimit } from "@/lib/rate-limit";
import { LINK_VAULT_ADDRESS, monadChain } from "@/config/chain";
const rpc = vi.hoisted(() => ({ readContract: vi.fn() }));
vi.mock("viem", async (original) => ({
  ...(await original<typeof import("viem")>()),
  createPublicClient: () => rpc,
}));
import { GET, POST } from "./route";
const alice = "0x1111111111111111111111111111111111111111";
const bob = "0x2222222222222222222222222222222222222222";
const origin = "https://monlipay.test";
const scope = {
  owner: alice,
  chainId: monadChain.id,
  contract: LINK_VAULT_ADDRESS,
};
let auth: ContactsStore, db: LinkBackupStore, token: string;
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubEnv("APP_ORIGIN", origin);
  _resetRateLimit();
  auth = new ContactsStore(":memory:");
  db = new LinkBackupStore(":memory:");
  token = auth.session(alice);
  vi.spyOn(contacts, "contactsStore").mockReturnValue(auth);
  vi.spyOn(backups, "linkBackupStore").mockReturnValue(db);
  rpc.readContract.mockReset();
});
afterEach(() => {
  auth.close();
  db.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function req(
  body?: unknown,
  options: {
    owner?: string;
    cookie?: string;
    origin?: string;
    query?: string;
    site?: string;
  } = {},
) {
  return new Request(origin + "/api/link-backups" + (options.query || ""), {
    method: body ? "POST" : "GET",
    headers: {
      "x-wallet-address": options.owner || alice,
      cookie: `${SESSION_COOKIE}=${options.cookie ?? token}`,
      origin: options.origin || origin,
      "content-type": "application/json",
      "sec-fetch-site": options.site || "same-origin",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
describe("encrypted backup HTTP boundary", () => {
  it("rejects unsigned reads, wallet substitution and cross-site access", async () => {
    for (const options of [
      { cookie: "" },
      { owner: bob },
      { site: "cross-site" },
    ])
      expect((await GET(req(undefined, options))).status).toBe(401);
    expect(
      (
        await POST(
          req({ action: "setup" }, { origin: "https://attacker.test" }),
        )
      ).status,
    ).toBe(403);
  });
  it("stores and returns only validated ciphertext for a verified sender", async () => {
    const recovery = generateRecoveryKey();
    const secret = generateSecretKey();
    const { profile, key } = await createBackupProfile(recovery, scope);
    const backup = await encryptLinkBackup(key, scope, profile, "1", secret);
    rpc.readContract.mockResolvedValue({
      sender: alice,
      claimKey: backup.claimKey,
    });
    expect((await POST(req({ action: "setup", profile }))).status).toBe(200);
    expect(
      (await POST(req({ action: "save", vaultId: profile.vaultId, backup })))
        .status,
    ).toBe(200);
    const result = await GET(req(undefined, { query: "?depositId=1" }));
    expect(result.headers.get("cache-control")).toBe("no-store");
    const text = await result.text();
    expect(text).not.toContain(secret.slice(2));
    expect(text).not.toContain(recovery);
    expect(JSON.parse(text).backup).toEqual(backup);
    expect((await GET(req(undefined, { query: "?depositId=2" }))).status).toBe(
      404,
    );
    expect((await GET(req(undefined, { query: "?depositId=-1" }))).status).toBe(
      400,
    );
  });
  it("rejects links owned by another wallet, wrong claim keys and RPC failure", async () => {
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
    db.create(scope, profile);
    const body = { action: "save", vaultId: profile.vaultId, backup };
    rpc.readContract.mockResolvedValue({
      sender: bob,
      claimKey: backup.claimKey,
    });
    expect((await POST(req(body))).status).toBe(403);
    rpc.readContract.mockResolvedValue({ sender: alice, claimKey: bob });
    expect((await POST(req(body))).status).toBe(403);
    rpc.readContract.mockRejectedValue(new Error("RPC offline"));
    expect((await POST(req(body))).status).toBe(503);
    expect(db.list(scope)).toEqual([]);
  });
  it("rejects plaintext fields, oversized requests and replacing an existing profile", async () => {
    const { profile } = await createBackupProfile(generateRecoveryKey(), scope);
    expect(
      (
        await POST(
          req({ action: "setup", profile, recoveryKey: "must-not-be-stored" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          req({
            action: "setup",
            profile: { ...profile, secret: "a".repeat(9000) },
          }),
        )
      ).status,
    ).toBe(400);
    db.create(scope, profile);
    const other = await createBackupProfile(generateRecoveryKey(), scope);
    expect(
      (await POST(req({ action: "setup", profile: other.profile }))).status,
    ).toBe(409);
  });
  it("expires and revokes access and applies an authenticated owner quota", async () => {
    for (let i = 0; i < 120; i++) expect((await GET(req())).status).toBe(200);
    expect((await GET(req())).status).toBe(429);
    auth.logout(token);
    expect((await GET(req())).status).toBe(401);
  });
});

it("stores only the passkey-wrapped root, keeps setup atomic, and prevents replacement", async () => {
  const { profile } = await createBackupProfile(generateRecoveryKey(), scope);
  const passkey = {
    version: 1,
    credentialId: "a".repeat(43),
    salt: "11".repeat(32),
    iv: "22".repeat(12),
    ciphertext: "33".repeat(48),
  };
  expect(
    (
      await POST(
        req({ action: "passkey", profile, passkey, recoveryKey: "forbidden" }),
      )
    ).status,
  ).toBe(400);
  expect(db.profile(scope)).toBeNull();
  expect(
    (await POST(req({ action: "passkey", profile, passkey }))).status,
  ).toBe(200);
  expect(
    (await POST(req({ action: "passkey", profile, passkey }))).status,
  ).toBe(200);
  const result = await (await GET(req())).json();
  expect(result.passkey).toEqual(passkey);
  expect(result.legacyRecovery).toBe(false);
  expect(
    (
      await POST(
        req({
          action: "passkey",
          profile,
          passkey: { ...passkey, iv: "ff".repeat(12) },
        }),
      )
    ).status,
  ).toBe(409);
});
