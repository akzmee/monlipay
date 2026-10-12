"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAccount, useChainId, useSignMessage } from "wagmi";
import { readContract } from "wagmi/actions";
import { wagmiConfig } from "@/config/wagmi";
import { LINK_VAULT_ADDRESS, monadChain } from "@/config/chain";
import { linkVaultAbi } from "@/lib/abi";
import {
  createBackupProfile,
  decryptLinkBackup,
  encryptLinkBackup,
  parseBackupLink,
  unlockBackupProfile,
} from "@/lib/link-backup-crypto";
import {
  parseBackupProfile,
  parseLinkBackup,
  parseLinkPasskey,
  type BackupProfile,
  type BackupScope,
  type BackupSummary,
  type LinkPasskey,
} from "@/lib/link-backup-format";
import {
  acknowledgeBackup,
  pendingBackups,
  queueBackup,
} from "@/lib/link-backup-outbox";
import { createLinkPasskey, openWithLinkPasskey } from "@/lib/link-passkey";
import {
  sealPrivateRecord,
  openPrivateRecord,
} from "@/lib/private-record-crypto";
import type { PrivateRecord } from "@/lib/private-record-format";

export type BackupStatus =
  "loading" | "signin" | "setup" | "locked" | "unlocked" | "error";
export const BACKUP_IDLE_MS = 15 * 60_000;
type BackupContextValue = {
  status: BackupStatus;
  profile: BackupProfile | null;
  passkey: LinkPasskey | null;
  legacyRecovery: boolean;
  links: BackupSummary[];
  busy: boolean;
  error: string;
  pending: number;
  scope: BackupScope;
  refresh: () => Promise<void>;
  signIn: () => Promise<void>;
  setup: (key: string) => Promise<void>;
  unlock: (key: string) => Promise<void>;
  enablePasskey: (previousKey?: string) => Promise<void>;
  unlockPasskey: () => Promise<void>;
  lock: () => void;
  saveLink: (url: string) => Promise<void>;
  openLink: (id: string) => Promise<string>;
  sync: () => Promise<void>;
  sealPrivate: (
    id: string,
    revision: number,
    value: unknown,
  ) => Promise<PrivateRecord>;
  openPrivate: (record: PrivateRecord) => Promise<unknown>;
  sessionGuard: () => () => void;
};
const Context = createContext<BackupContextValue | null>(null);
export function useLinkBackups() {
  const context = useContext(Context);
  if (!context) throw new Error("LinkBackupProvider is missing.");
  return context;
}

/** Remount on account/network change: an old async operation can never unlock another wallet. */
export function LinkBackupProvider({ children }: { children: ReactNode }) {
  const { address } = useAccount();
  const chainId = useChainId();
  return (
    <BackupSession
      key={`${address?.toLowerCase()}:${chainId}`}
      owner={address}
      enabled={chainId === monadChain.id}
    >
      {children}
    </BackupSession>
  );
}
function BackupSession({
  owner,
  enabled,
  children,
}: {
  owner?: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const scope: BackupScope = {
    owner: owner || "",
    chainId: monadChain.id,
    contract: LINK_VAULT_ADDRESS,
  };
  const { signMessageAsync } = useSignMessage();
  const [status, setStatus] = useState<BackupStatus>("loading");
  const [profile, setProfile] = useState<BackupProfile | null>(null);
  const [passkey, setPasskey] = useState<LinkPasskey | null>(null);
  const [legacyRecovery, setLegacyRecovery] = useState(false);
  const [links, setLinks] = useState<BackupSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const keyRef = useRef<CryptoKey | null>(null);
  const alive = useRef(true);
  const generation = useRef(0);
  const mutex = useRef(false);
  const saveJobs = useRef(new Map<string, Promise<void>>());
  const preparedSetup = useRef<{
    profile: BackupProfile;
    key: CryptoKey;
  } | null>(null);
  const preparedPasskey = useRef<Awaited<
    ReturnType<typeof createLinkPasskey>
  > | null>(null);
  const ceremony = useRef<AbortController | null>(null);

  const lock = useCallback(() => {
    generation.current++;
    keyRef.current = null;
    preparedSetup.current = null;
    preparedPasskey.current = null;
    ceremony.current?.abort();
    if (alive.current) setStatus((s) => (s === "unlocked" ? "locked" : s));
  }, []);
  const assertActive = (version?: number) => {
    if (
      !alive.current ||
      !owner ||
      !enabled ||
      (version !== undefined && generation.current !== version)
    )
      throw new Error(
        "Links were locked or the wallet changed. Unlock and retry.",
      );
  };
  const request = useCallback(
    async (path = "", body?: unknown) => {
      if (!owner || !enabled || !alive.current)
        throw new Error("Connect your wallet on this network first.");
      const response = await fetch(`/api/link-backups${path}`, {
        method: body ? "POST" : "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "x-wallet-address": owner,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15_000),
      });
      if (!alive.current) throw new Error("Wallet changed.");
      if (response.status === 401) {
        lock();
        setStatus("signin");
        setLinks([]);
        throw new Error(
          "Your session expired. Verify your wallet again to access saved links.",
        );
      }
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "Could not reach your saved links. Please retry.",
        );
      return data;
    },
    [owner, enabled, lock],
  );
  const refresh = useCallback(async () => {
    if (!owner || !enabled) {
      setStatus("signin");
      return;
    }
    const version = generation.current;
    try {
      const data = await request();
      if (!alive.current || generation.current !== version) return;
      const loaded = data.profile ? parseBackupProfile(data.profile) : null;
      setProfile(loaded);
      setPasskey(data.passkey ? parseLinkPasskey(data.passkey) : null);
      setLegacyRecovery(
        data.legacyRecovery === true || (!!loaded && !data.passkey),
      );
      setLinks(data.links);
      setPending(
        loaded
          ? pendingBackups(
              { owner, chainId: monadChain.id, contract: LINK_VAULT_ADDRESS },
              loaded,
            ).length
          : 0,
      );
      setStatus(loaded ? (keyRef.current ? "unlocked" : "locked") : "setup");
      setError("");
    } catch (e) {
      if (!alive.current || generation.current !== version) return;
      setError(e instanceof Error ? e.message : "Could not load saved links.");
      setStatus("error");
    }
  }, [owner, enabled, request]);
  useEffect(() => {
    alive.current = true;
    const task = setTimeout(() => void refresh(), 0);
    const pageHide = () => lock();
    window.addEventListener("pagehide", pageHide);
    return () => {
      alive.current = false;
      lock();
      clearTimeout(task);
      window.removeEventListener("pagehide", pageHide);
    };
  }, [refresh, lock]);
  useEffect(() => {
    if (status !== "unlocked") return;
    let lastActivity = Date.now();
    const activity = () => {
      if (Date.now() - lastActivity >= BACKUP_IDLE_MS) {
        lock();
        return;
      }
      lastActivity = Date.now();
    };
    const check = () => {
      if (Date.now() - lastActivity >= BACKUP_IDLE_MS) lock();
    };
    const timer = setInterval(check, 10_000);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      document.removeEventListener("visibilitychange", check);
    };
  }, [status, lock]);
  const run = async (fn: () => Promise<void>) => {
    if (mutex.current) throw new Error("Please wait for the current action.");
    mutex.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "Could not complete this action. Please retry.",
        );
      throw e;
    } finally {
      mutex.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const signIn = () =>
    run(async () => {
      assertActive();
      const version = generation.current;
      const post = async (body: unknown) => {
        const response = await fetch("/api/contacts/session", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Sign-in failed. Please retry.");
        return data;
      };
      const challenge = await post({ action: "challenge", address: owner });
      assertActive(version);
      const signature = await signMessageAsync({
        account: owner as `0x${string}`,
        message: challenge.message,
      });
      assertActive(version);
      await post({ action: "verify", signature });
      assertActive(version);
      await refresh();
    });
  const setup = (recovery: string) =>
    run(async () => {
      assertActive();
      const version = generation.current;
      const created = preparedSetup.current
        ? {
            profile: preparedSetup.current.profile,
            key: await unlockBackupProfile(
              recovery,
              scope,
              preparedSetup.current.profile,
            ),
          }
        : await createBackupProfile(recovery, scope);
      preparedSetup.current = created;
      assertActive(version);
      await request("", { action: "setup", profile: created.profile });
      assertActive(version);
      keyRef.current = created.key;
      preparedSetup.current = null;
      setProfile(created.profile);
      setStatus("unlocked");
    });
  const unlock = (recovery: string) =>
    run(async () => {
      if (!profile) throw new Error("Enable saving your links first.");
      const version = generation.current;
      const key = await unlockBackupProfile(recovery, scope, profile);
      assertActive(version);
      keyRef.current = key;
      setStatus("unlocked");
    });
  const enablePasskey = (previousKey?: string) =>
    run(async () => {
      assertActive();
      const version = generation.current;
      if (profile && !previousKey && !preparedPasskey.current)
        throw new Error(
          "Enter your previous recovery key once to switch these links to a passkey.",
        );
      ceremony.current = new AbortController();
      const created =
        preparedPasskey.current ??
        (await createLinkPasskey(
          scope,
          profile ? { profile, recovery: previousKey! } : undefined,
          ceremony.current.signal,
        ));
      assertActive(version);
      preparedPasskey.current = created;
      const stored = await request("", {
        action: "passkey",
        profile: created.profile,
        passkey: created.passkey,
      });
      assertActive(version);
      keyRef.current = created.key;
      setProfile(created.profile);
      setPasskey(created.passkey);
      setLegacyRecovery(stored.legacyRecovery === true);
      preparedPasskey.current = null;
      setStatus("unlocked");
    });
  const unlockPasskey = () =>
    run(async () => {
      assertActive();
      if (!profile || !passkey)
        throw new Error("Set up a passkey to save your links first.");
      const version = generation.current;
      ceremony.current = new AbortController();
      const key = await openWithLinkPasskey(
        scope,
        profile,
        passkey,
        ceremony.current.signal,
      );
      assertActive(version);
      keyRef.current = key;
      setStatus("unlocked");
    });
  const activeKey = () => {
    assertActive();
    if (!keyRef.current || !profile || status !== "unlocked")
      throw new Error("Unlock your saved links first.");
    return { key: keyRef.current, profile, version: generation.current };
  };
  const sealPrivate = async (id: string, revision: number, value: unknown) => {
    const { key, profile: p, version } = activeKey();
    const record = await sealPrivateRecord(
      key,
      scope,
      p.vaultId,
      id,
      revision,
      value,
    );
    assertActive(version);
    return record;
  };
  const openPrivate = async (record: PrivateRecord) => {
    const { key, profile: p, version } = activeKey();
    const value = await openPrivateRecord(key, scope, p.vaultId, record);
    assertActive(version);
    return value;
  };
  const sessionGuard = () => {
    const { version } = activeKey();
    return () => {
      assertActive(version);
      if (!keyRef.current) throw new Error("Open your passkey again.");
    };
  };
  const verifyClaim = async (id: string, claimKey: string) => {
    const deposit = await readContract(wagmiConfig, {
      address: LINK_VAULT_ADDRESS,
      abi: linkVaultAbi,
      functionName: "getDeposit",
      args: [BigInt(id)],
      chainId: monadChain.id,
    });
    if (
      deposit.sender.toLowerCase() !== owner?.toLowerCase() ||
      deposit.claimKey.toLowerCase() !== claimKey.toLowerCase()
    )
      throw new Error(
        "This payment link does not belong to this wallet, network or claim key.",
      );
  };
  const saveLink = async (url: string): Promise<void> => {
    const parsed = parseBackupLink(url, window.location.origin);
    const id = parsed.depositId.toString();
    const existing = saveJobs.current.get(id);
    if (existing) return existing;
    const work = async () => {
      const { key, profile: p, version } = activeKey();
      await verifyClaim(id, parsed.claimKey);
      assertActive(version);
      // An existing backup must decrypt successfully before it is treated as saved.
      if (links.some((l) => l.depositId === id)) {
        await openLink(id);
        return;
      }
      const queued = pendingBackups(scope, p).find((b) => b.depositId === id);
      const backup =
        queued ||
        (await encryptLinkBackup(key, scope, p, id, parsed.secretKey));
      if (queued)
        await decryptLinkBackup(key, scope, p, queued, window.location.origin);
      assertActive(version);
      const durable = queueBackup(scope, p, backup);
      setPending(pendingBackups(scope, p).length);
      try {
        await request("", { action: "save", vaultId: p.vaultId, backup });
        assertActive(version);
        acknowledgeBackup(scope, p, id);
        setPending(pendingBackups(scope, p).length);
        setLinks((rows) => [
          { depositId: id, claimKey: backup.claimKey, createdAt: Date.now() },
          ...rows.filter((r) => r.depositId !== id),
        ]);
      } catch (e) {
        throw new Error(
          durable
            ? "Encrypted copy saved on this device, but not synced. Keep your original link and use Retry sync."
            : e instanceof Error
              ? e.message
              : "Could not save. Keep your original link and retry.",
        );
      }
    };
    const job = work();
    saveJobs.current.set(id, job);
    try {
      await job;
    } finally {
      saveJobs.current.delete(id);
    }
  };
  const openLink = async (id: string) => {
    const { key, profile: p, version } = activeKey();
    const data = await request(`?depositId=${encodeURIComponent(id)}`);
    const backup = parseLinkBackup(data.backup);
    if (backup.depositId !== id)
      throw new Error("The saved link ID does not match.");
    const url = await decryptLinkBackup(
      key,
      scope,
      p,
      backup,
      window.location.origin,
    );
    await verifyClaim(id, backup.claimKey);
    assertActive(version);
    return url;
  };
  const sync = () =>
    run(async () => {
      const { key, profile: p, version } = activeKey();
      for (const backup of pendingBackups(scope, p)) {
        // Treat localStorage as untrusted: authenticate ciphertext and ownership before upload.
        await decryptLinkBackup(key, scope, p, backup, window.location.origin);
        await verifyClaim(backup.depositId, backup.claimKey);
        assertActive(version);
        await request("", { action: "save", vaultId: p.vaultId, backup });
        assertActive(version);
        acknowledgeBackup(scope, p, backup.depositId);
      }
      await refresh();
    });
  return (
    <Context.Provider
      value={{
        status,
        profile,
        passkey,
        legacyRecovery,
        links,
        busy,
        error,
        pending,
        scope,
        refresh,
        signIn,
        setup,
        unlock,
        enablePasskey,
        unlockPasskey,
        lock,
        saveLink,
        openLink,
        sync,
        sealPrivate,
        openPrivate,
        sessionGuard,
      }}
    >
      {children}
    </Context.Provider>
  );
}
