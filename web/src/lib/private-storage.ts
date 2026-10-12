import type { useLinkBackups } from "@/components/LinkBackupProvider";
import {
  parsePrivateRecord,
  type PrivateRecord,
} from "./private-record-format";
type Vault = ReturnType<typeof useLinkBackups>;
export type OpenPrivateRecord = {
  id: string;
  revision: number;
  value: unknown;
};
export class PrivateStorage {
  constructor(
    private vault: Vault,
    private guard: () => void,
  ) {}
  private prefix() {
    return `monlipay-private:${this.vault.scope.owner.toLowerCase()}:${this.vault.profile!.vaultId}:`;
  }
  private async request(path: string, record?: PrivateRecord) {
    this.guard();
    const response = await fetch(`/api/private-links${path}`, {
      method: record ? "POST" : "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "x-wallet-address": this.vault.scope.owner,
        ...(record ? { "Content-Type": "application/json" } : {}),
      },
      ...(record
        ? {
            body: JSON.stringify({
              vaultId: this.vault.profile!.vaultId,
              record,
            }),
          }
        : {}),
      signal: AbortSignal.timeout(15_000),
    });
    this.guard();
    if (response.status === 404 && !record) return null;
    if (!response.ok)
      throw new Error(
        response.status === 409
          ? "This payment changed in another session. Reload before continuing."
          : "Encrypted payment could not sync. Keep this browser open and retry syncing before continuing.",
      );
    return response.json();
  }
  async get(id: string): Promise<OpenPrivateRecord | null> {
    const data = await this.request(`?id=${encodeURIComponent(id)}`);
    if (!data) return null;
    const record = parsePrivateRecord(data.record);
    if (record.id !== id)
      throw new Error("Saved private payment does not match.");
    return {
      id,
      revision: record.revision,
      value: await this.vault.openPrivate(record),
    };
  }
  async recoverAccount() {
    // A second tab may have created the immutable account first. Its
    // authenticated ciphertext is authoritative before any funding begins.
    const account = await this.get("sender-v1");
    if (account) localStorage.removeItem(this.prefix() + "sender-v1:1");
    return account;
  }
  async list() {
    await this.sync();
    const data = await this.request("");
    const summaries = data?.records as PrivateRecord[];
    if (!Array.isArray(summaries) || summaries.length > 201)
      throw new Error("Invalid private payment history.");
    const result: OpenPrivateRecord[] = [];
    for (let i = 0; i < summaries.length; i += 8) {
      const batch = await Promise.all(
        summaries.slice(i, i + 8).map(async (input) => {
          const r = parsePrivateRecord(input);
          return {
            id: r.id,
            revision: r.revision,
            value: await this.vault.openPrivate(r),
          };
        }),
      );
      result.push(...batch);
    }
    return result;
  }
  async save(id: string, revision: number, value: unknown) {
    this.guard();
    const record = await this.vault.sealPrivate(id, revision, value);
    const key = this.prefix() + id + ":" + revision;
    // Persist ciphertext before network activity; fail before funding if this
    // device cannot retain an interrupted operation's encrypted update.
    localStorage.setItem(key, JSON.stringify(record));
    const data = await this.request("", record);
    const saved = parsePrivateRecord(data.record);
    if (JSON.stringify(saved) !== JSON.stringify(record))
      throw new Error("Saved private payment does not match.");
    localStorage.removeItem(key);
    return { id, revision, value };
  }
  async sync() {
    this.guard();
    const prefix = this.prefix();
    const keys = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index),
    )
      .filter((k): k is string => k !== null && k.startsWith(prefix))
      .sort(
        (a, b) => Number(a.split(":").at(-1)) - Number(b.split(":").at(-1)),
      );
    for (const key of keys) {
      const record = parsePrivateRecord(JSON.parse(localStorage.getItem(key)!));
      await this.vault.openPrivate(record); // Reject tampered local ciphertext.
      const current = await this.get(record.id);
      if (current && record.id === "sender-v1") {
        localStorage.removeItem(key);
        continue;
      }
      if (current && current.revision > record.revision) {
        localStorage.removeItem(key);
        continue;
      }
      const saved = await this.request("", record);
      if (
        JSON.stringify(parsePrivateRecord(saved.record)) !==
        JSON.stringify(record)
      )
        throw new Error("Private payment sync needs review.");
      localStorage.removeItem(key);
    }
  }
}
