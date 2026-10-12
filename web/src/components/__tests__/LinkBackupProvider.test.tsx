import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  LinkBackupProvider,
  useLinkBackups,
  BACKUP_IDLE_MS,
} from "../LinkBackupProvider";
import {
  createBackupProfile,
  encryptLinkBackup,
  generateRecoveryKey,
} from "@/lib/link-backup-crypto";
import {
  buildShareableUrl,
  generateSecretKey,
  privateKeyToClaimKey,
} from "@/lib/crypto";
import { monadChain, LINK_VAULT_ADDRESS } from "@/config/chain";
import { queueBackup } from "@/lib/link-backup-outbox";
import type {
  BackupProfile,
  LinkBackup,
  LinkPasskey,
} from "@/lib/link-backup-format";

const mocks = vi.hoisted(() => ({
  owner: "0x1111111111111111111111111111111111111111",
  read: vi.fn(),
  sign: vi.fn(),
  createPasskey: vi.fn(),
  openPasskey: vi.fn(),
}));
vi.mock("@/lib/link-passkey", () => ({
  createLinkPasskey: (...args: unknown[]) => mocks.createPasskey(...args),
  openWithLinkPasskey: (...args: unknown[]) => mocks.openPasskey(...args),
}));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: mocks.owner }),
  useChainId: () => monadChain.id,
  useSignMessage: () => ({ signMessageAsync: mocks.sign }),
}));
vi.mock("wagmi/actions", () => ({
  readContract: (...args: unknown[]) => mocks.read(...args),
}));
vi.mock("@/config/wagmi", () => ({ wagmiConfig: {} }));
const owner = "0x1111111111111111111111111111111111111111";
const scope = { owner, chainId: monadChain.id, contract: LINK_VAULT_ADDRESS };
let profile: BackupProfile | null;
let records: LinkBackup[];
let passkey: LinkPasskey | null;
let failPasskey: boolean;
let signedIn: boolean;
let failSave: boolean;
let sent: string[];
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  localStorage.clear();
  mocks.owner = owner;
  mocks.read.mockReset();
  mocks.sign.mockResolvedValue("0xsignature");
  profile = null;
  passkey = null;
  failPasskey = false;
  mocks.createPasskey.mockReset();
  mocks.openPasskey.mockReset();
  records = [];
  signedIn = true;
  failSave = false;
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      const body = options?.body ? JSON.parse(String(options.body)) : null;
      if (options?.body) sent.push(String(options.body));
      if (path.includes("/session")) {
        if (body.action === "challenge")
          return response({ message: "Sign in to MonliPay" });
        signedIn = true;
        return response({ address: owner });
      }
      if (!signedIn) return response({ error: "Sign in" }, 401);
      if (body?.action === "passkey") {
        profile = body.profile;
        passkey = body.passkey;
        if (failPasskey) return response({ error: "Response lost" }, 503);
        return response({ profile, passkey, legacyRecovery: false });
      }
      if (body?.action === "setup") {
        profile = body.profile;
        return response({ profile });
      }
      if (body?.action === "save") {
        if (failSave) return response({ error: "Offline" }, 503);
        records.push(body.backup);
        return response({ backup: body.backup });
      }
      if (path.includes("?depositId="))
        return response({
          backup: records.find((r) => r.depositId === path.split("=")[1]),
        });
      return response({
        profile,
        passkey,
        links: records.map((r) => ({
          depositId: r.depositId,
          claimKey: r.claimKey,
          createdAt: 1,
        })),
      });
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LinkBackupProvider>{children}</LinkBackupProvider>
);
async function ready() {
  const recovery = generateRecoveryKey();
  const created = await createBackupProfile(recovery, scope);
  profile = created.profile;
  const hook = renderHook(() => useLinkBackups(), { wrapper });
  await waitFor(() => expect(hook.result.current.status).toBe("locked"));
  await act(async () => {
    await hook.result.current.unlock(recovery);
  });
  return { ...hook, recovery, ...created };
}
describe("backup session lifecycle", () => {
  it("requires wallet sign-in and never uploads the recovery key during setup", async () => {
    signedIn = false;
    const { result } = renderHook(() => useLinkBackups(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signin"));
    await act(async () => {
      await result.current.signIn();
    });
    expect(result.current.status).toBe("setup");
    const recovery = generateRecoveryKey();
    await act(async () => {
      await result.current.setup(recovery);
    });
    expect(result.current.status).toBe("unlocked");
    expect(sent.join()).not.toContain(recovery);
    expect(sent.join()).not.toContain(recovery.replaceAll("-", "").slice(4));
    expect(localStorage.length).toBe(0);
  });
  it("backs up, locks, and restores a verified claim URL without plaintext persistence", async () => {
    const { result, recovery } = await ready();
    const secret = generateSecretKey();
    const url = buildShareableUrl(window.location.origin, 42n, secret);
    mocks.read.mockResolvedValue({
      sender: owner,
      claimKey: privateKeyToClaimKey(secret),
    });
    await act(async () => {
      await result.current.saveLink(url);
    });
    expect(result.current.links).toHaveLength(1);
    expect(localStorage.length).toBe(0);
    expect(sent.join()).not.toContain(secret.slice(2));
    expect(sent.join()).not.toContain(url);
    expect(sent.join()).not.toContain(recovery);
    let recovered = "";
    await act(async () => {
      recovered = await result.current.openLink("42");
    });
    expect(recovered).toBe(url);
    act(() => result.current.lock());
    await expect(result.current.openLink("42")).rejects.toThrow("Unlock");
    await act(async () => {
      await result.current.unlock(recovery);
    });
    await expect(result.current.openLink("42")).resolves.toBe(url);
  });
  it("retains a ciphertext retry queue across reload and syncs it only after unlock", async () => {
    const { result, recovery, unmount } = await ready();
    const secret = generateSecretKey();
    mocks.read.mockResolvedValue({
      sender: owner,
      claimKey: privateKeyToClaimKey(secret),
    });
    failSave = true;
    await act(async () => {
      await expect(
        result.current.saveLink(buildShareableUrl(location.origin, 3n, secret)),
      ).rejects.toThrow("not synced");
    });
    expect(result.current.pending).toBe(1);
    expect(records).toHaveLength(0);
    expect(localStorage.getItem(localStorage.key(0)!)).not.toContain(
      secret.slice(2),
    );
    unmount();
    const next = renderHook(() => useLinkBackups(), { wrapper });
    await waitFor(() => expect(next.result.current.status).toBe("locked"));
    expect(next.result.current.pending).toBe(1);
    await act(async () => {
      await next.result.current.unlock(recovery);
    });
    failSave = false;
    await act(async () => {
      await next.result.current.sync();
    });
    expect(next.result.current.pending).toBe(0);
    expect(next.result.current.links).toHaveLength(1);
    expect(localStorage.length).toBe(0);
  });
  it("blocks saving a link belonging to another sender", async () => {
    const { result } = await ready();
    const secret = generateSecretKey();
    mocks.read.mockResolvedValue({
      sender: "0x2222222222222222222222222222222222222222",
      claimKey: privateKeyToClaimKey(secret),
    });
    await expect(
      result.current.saveLink(buildShareableUrl(location.origin, 3n, secret)),
    ).rejects.toThrow("does not belong");
    expect(records).toEqual([]);
    expect(localStorage.length).toBe(0);
  });
  it("discards an in-flight decryption when the user locks backups", async () => {
    const { result, key, profile: p } = await ready();
    const secret = generateSecretKey();
    records.push(await encryptLinkBackup(key, scope, p, "42", secret));
    let complete!: (value: unknown) => void;
    mocks.read.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const promise = result.current.openLink("42");
    await waitFor(() => expect(mocks.read).toHaveBeenCalled());
    act(() => result.current.lock());
    complete({ sender: owner, claimKey: privateKeyToClaimKey(secret) });
    await expect(promise).rejects.toThrow("locked");
  });
  it("clears the key on wallet change and a browser pagehide event", async () => {
    const { result, rerender } = await ready();
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(result.current.status).toBe("locked");
    mocks.owner = "0x2222222222222222222222222222222222222222";
    rerender();
    await waitFor(() => expect(result.current.status).toBe("locked"));
    await expect(result.current.openLink("42")).rejects.toThrow("Unlock");
  });
  it("locks after 15 minutes of inactivity", async () => {
    const { result } = await ready();
    vi.useFakeTimers();
    // Visibility checks also catch a suspended background tab returning after the deadline.
    vi.setSystemTime(Date.now() + BACKUP_IDLE_MS + 1);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(result.current.status).toBe("locked");
  });
  it("refuses a tampered queued record before uploading it", async () => {
    const { result, key, profile: p } = await ready();
    const backup = await encryptLinkBackup(
      key,
      scope,
      p,
      "42",
      generateSecretKey(),
    );
    queueBackup(scope, p, { ...backup, ciphertext: "00".repeat(48) });
    await act(async () => {
      await expect(result.current.sync()).rejects.toThrow("verified");
    });
    expect(records).toEqual([]);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});

it("retries a lost setup response with the same passkey and can reopen after a refresh", async () => {
  const created = await createBackupProfile(generateRecoveryKey(), scope);
  const envelope: LinkPasskey = {
    version: 1,
    credentialId: "a".repeat(43),
    salt: "11".repeat(32),
    iv: "22".repeat(12),
    ciphertext: "33".repeat(48),
  };
  mocks.createPasskey.mockResolvedValue({ ...created, passkey: envelope });
  mocks.openPasskey.mockResolvedValue(created.key);
  const hook = renderHook(() => useLinkBackups(), { wrapper });
  await waitFor(() => expect(hook.result.current.status).toBe("setup"));
  failPasskey = true;
  await act(async () => {
    await expect(hook.result.current.enablePasskey()).rejects.toThrow(
      "Response lost",
    );
  });
  expect(hook.result.current.status).toBe("setup");
  failPasskey = false;
  await act(async () => {
    await hook.result.current.enablePasskey();
  });
  expect(mocks.createPasskey).toHaveBeenCalledTimes(1);
  expect(hook.result.current.status).toBe("unlocked");
  expect(localStorage.length).toBe(0);
  hook.unmount();
  const next = renderHook(() => useLinkBackups(), { wrapper });
  await waitFor(() => expect(next.result.current.status).toBe("locked"));
  await act(async () => {
    await next.result.current.unlockPasskey();
  });
  expect(next.result.current.status).toBe("unlocked");
});
it("aborts a pending passkey operation on wallet change and never uploads its result", async () => {
  const created = await createBackupProfile(generateRecoveryKey(), scope);
  let finish!: (value: unknown) => void;
  mocks.createPasskey.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(() => useLinkBackups(), { wrapper });
  await waitFor(() => expect(hook.result.current.status).toBe("setup"));
  let operation!: Promise<void>;
  act(() => {
    operation = hook.result.current.enablePasskey();
  });
  const signal = mocks.createPasskey.mock.calls[0][2] as AbortSignal;
  mocks.owner = "0x2222222222222222222222222222222222222222";
  hook.rerender();
  expect(signal.aborted).toBe(true);
  await act(async () => {
    finish({
      ...created,
      passkey: {
        version: 1,
        credentialId: "a".repeat(43),
        salt: "11".repeat(32),
        iv: "22".repeat(12),
        ciphertext: "33".repeat(48),
      },
    });
    await expect(operation).rejects.toThrow("wallet changed");
  });
  expect(sent).toEqual([]);
});
