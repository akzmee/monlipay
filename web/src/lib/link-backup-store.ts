import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  parsePrivateRecord,
  privateRecordId,
  type PrivateRecord,
  type PrivateRecordSummary,
} from "./private-record-format";
import {
  MAX_LINK_BACKUPS,
  backupId,
  parseBackupProfile,
  parseLinkBackup,
  parseLinkPasskey,
  type BackupProfile,
  type BackupScope,
  type BackupSummary,
  type LinkBackup,
  type LinkPasskey,
} from "./link-backup-format";

export class BackupConflict extends Error {}
/** Append-only ciphertext store. A wallet session never grants a key-reset operation. */
export class LinkBackupStore {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS backup_profiles (
        owner TEXT NOT NULL, chain INTEGER NOT NULL, contract TEXT NOT NULL,
        vault TEXT NOT NULL, profile TEXT NOT NULL, created INTEGER NOT NULL,
        PRIMARY KEY (owner, chain, contract), UNIQUE(owner, chain, contract, vault));
      CREATE TABLE IF NOT EXISTS link_backups (
        owner TEXT NOT NULL, chain INTEGER NOT NULL, contract TEXT NOT NULL, vault TEXT NOT NULL,
        deposit TEXT NOT NULL, claim TEXT NOT NULL, iv TEXT NOT NULL, ciphertext TEXT NOT NULL, created INTEGER NOT NULL,
        PRIMARY KEY (owner, chain, contract, deposit),
        UNIQUE(owner, chain, contract, vault, iv),
        FOREIGN KEY (owner, chain, contract, vault) REFERENCES backup_profiles(owner, chain, contract, vault));
      CREATE TABLE IF NOT EXISTS link_passkeys (
        owner TEXT NOT NULL, chain INTEGER NOT NULL, contract TEXT NOT NULL, vault TEXT NOT NULL,
        envelope TEXT NOT NULL, legacy INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(owner, chain, contract),
        FOREIGN KEY(owner, chain, contract, vault) REFERENCES backup_profiles(owner, chain, contract, vault));
      CREATE TABLE IF NOT EXISTS private_payment_records (
        owner TEXT NOT NULL, chain INTEGER NOT NULL, contract TEXT NOT NULL, vault TEXT NOT NULL,
        id TEXT NOT NULL, kind TEXT NOT NULL, revision INTEGER NOT NULL, iv TEXT NOT NULL,
        ciphertext TEXT NOT NULL, created INTEGER NOT NULL,
        PRIMARY KEY(owner, chain, contract, id, revision), UNIQUE(owner, chain, contract, vault, iv),
        FOREIGN KEY(owner, chain, contract, vault) REFERENCES backup_profiles(owner, chain, contract, vault));`);
  }
  close() {
    this.db.close();
  }
  private params(s: BackupScope) {
    return [
      s.owner.toLowerCase(),
      s.chainId,
      s.contract.toLowerCase(),
    ] as const;
  }
  profile(scope: BackupScope): BackupProfile | null {
    const row = this.db
      .prepare(
        "SELECT profile FROM backup_profiles WHERE owner=? AND chain=? AND contract=?",
      )
      .get(...this.params(scope));
    return row ? parseBackupProfile(JSON.parse(String(row.profile))) : null;
  }
  create(scope: BackupScope, input: unknown): BackupProfile {
    const profile = parseBackupProfile(input);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.profile(scope);
      if (existing && JSON.stringify(existing) !== JSON.stringify(profile))
        throw new BackupConflict(
          "Backups are already set up. Reload and use the existing recovery key.",
        );
      if (!existing)
        this.db
          .prepare("INSERT INTO backup_profiles VALUES (?, ?, ?, ?, ?, ?)")
          .run(
            ...this.params(scope),
            profile.vaultId,
            JSON.stringify(profile),
            Date.now(),
          );
      this.db.exec("COMMIT");
      return profile;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  passkey(scope: BackupScope): LinkPasskey | null {
    const row = this.db
      .prepare(
        "SELECT envelope FROM link_passkeys WHERE owner=? AND chain=? AND contract=?",
      )
      .get(...this.params(scope));
    return row ? parseLinkPasskey(JSON.parse(String(row.envelope))) : null;
  }
  hasLegacyRecovery(scope: BackupScope): boolean {
    const row = this.db
      .prepare(
        "SELECT legacy FROM link_passkeys WHERE owner=? AND chain=? AND contract=?",
      )
      .get(...this.params(scope));
    return row ? row.legacy === 1 : this.profile(scope) !== null;
  }
  /** Atomic first setup or one-time legacy migration. Never replaces a profile or passkey. */
  savePasskey(scope: BackupScope, input: unknown, envelope: unknown) {
    const profile = parseBackupProfile(input);
    const passkey = parseLinkPasskey(envelope);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.profile(scope);
      if (current && JSON.stringify(current) !== JSON.stringify(profile))
        throw new BackupConflict(
          "Saved links already use a different key. Reload to open your existing links.",
        );
      const previous = this.passkey(scope);
      if (previous && JSON.stringify(previous) !== JSON.stringify(passkey))
        throw new BackupConflict(
          "A passkey is already connected. Reload and use the existing passkey.",
        );
      if (!current)
        this.db
          .prepare("INSERT INTO backup_profiles VALUES (?, ?, ?, ?, ?, ?)")
          .run(
            ...this.params(scope),
            profile.vaultId,
            JSON.stringify(profile),
            Date.now(),
          );
      if (!previous)
        this.db
          .prepare("INSERT INTO link_passkeys VALUES (?, ?, ?, ?, ?, ?)")
          .run(
            ...this.params(scope),
            profile.vaultId,
            JSON.stringify(passkey),
            current ? 1 : 0,
          );
      this.db.exec("COMMIT");
      return {
        profile,
        passkey,
        legacyRecovery: this.hasLegacyRecovery(scope),
      };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  list(scope: BackupScope): BackupSummary[] {
    return this.db
      .prepare(
        "SELECT deposit, claim, created FROM link_backups WHERE owner=? AND chain=? AND contract=? ORDER BY created DESC, deposit DESC LIMIT ?",
      )
      .all(...this.params(scope), MAX_LINK_BACKUPS)
      .map((r) => ({
        depositId: String(r.deposit),
        claimKey: String(r.claim),
        createdAt: Number(r.created),
      }));
  }
  get(scope: BackupScope, id: string): LinkBackup | null {
    backupId(id);
    const r = this.db
      .prepare(
        "SELECT deposit, claim, iv, ciphertext FROM link_backups WHERE owner=? AND chain=? AND contract=? AND deposit=?",
      )
      .get(...this.params(scope), id);
    return r
      ? {
          depositId: String(r.deposit),
          claimKey: String(r.claim),
          iv: String(r.iv),
          ciphertext: String(r.ciphertext),
        }
      : null;
  }
  save(scope: BackupScope, vault: string, input: unknown): LinkBackup {
    const row = parseLinkBackup(input);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const profile = this.profile(scope);
      if (!profile || profile.vaultId !== vault)
        throw new BackupConflict(
          "The backup key has changed. Reload and unlock again.",
        );
      if (
        row.iv === profile.check.iv ||
        this.db
          .prepare(
            "SELECT 1 FROM private_payment_records WHERE owner=? AND chain=? AND contract=? AND vault=? AND iv=?",
          )
          .get(...this.params(scope), vault, row.iv)
      )
        throw new BackupConflict("Encryption nonce was reused. Please retry.");
      const existing = this.get(scope, row.depositId);
      if (existing && JSON.stringify(existing) !== JSON.stringify(row))
        throw new BackupConflict(
          "A backup for this link already exists. Reload to open the saved copy.",
        );
      if (!existing) {
        const count = this.db
          .prepare(
            "SELECT COUNT(*) AS n FROM link_backups WHERE owner=? AND chain=? AND contract=?",
          )
          .get(...this.params(scope));
        if (Number(count?.n) >= MAX_LINK_BACKUPS)
          throw new BackupConflict(
            "Backup storage is full (5,000 links). Keep your original link.",
          );
        this.db
          .prepare(
            "INSERT INTO link_backups VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            ...this.params(scope),
            vault,
            row.depositId,
            row.claimKey,
            row.iv,
            row.ciphertext,
            Date.now(),
          );
      }
      this.db.exec("COMMIT");
      return row;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  privateList(scope: BackupScope): PrivateRecordSummary[] {
    return this.db
      .prepare(
        "SELECT id, kind, MAX(revision) AS revision, MIN(created) AS created FROM private_payment_records WHERE owner=? AND chain=? AND contract=? GROUP BY id, kind ORDER BY created DESC LIMIT 201",
      )
      .all(...this.params(scope))
      .map((r) => ({
        id: String(r.id),
        kind: String(r.kind) as PrivateRecord["kind"],
        revision: Number(r.revision),
        createdAt: Number(r.created),
      }));
  }
  privateGet(scope: BackupScope, id: string): PrivateRecord | null {
    privateRecordId(id);
    const r = this.db
      .prepare(
        "SELECT id,kind,revision,iv,ciphertext FROM private_payment_records WHERE owner=? AND chain=? AND contract=? AND id=? ORDER BY revision DESC LIMIT 1",
      )
      .get(...this.params(scope), id);
    return r
      ? parsePrivateRecord({
          id: r.id,
          kind: r.kind,
          revision: Number(r.revision),
          iv: r.iv,
          ciphertext: r.ciphertext,
        })
      : null;
  }
  privateSave(
    scope: BackupScope,
    vault: string,
    input: unknown,
  ): PrivateRecord {
    const r = parsePrivateRecord(input);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const profile = this.profile(scope);
      if (
        scope.chainId !== 143 ||
        !profile ||
        profile.vaultId !== vault ||
        !this.passkey(scope)
      )
        throw new BackupConflict("Open your passkey on Monad mainnet first.");
      const previous = this.privateGet(scope, r.id);
      if (previous && JSON.stringify(previous) === JSON.stringify(r)) {
        this.db.exec("COMMIT");
        return previous;
      }
      if (
        r.revision !== (previous?.revision ?? 0) + 1 ||
        (previous && r.kind === "account")
      )
        throw new BackupConflict(
          "This private payment changed in another session. Reload before continuing.",
        );
      if (!previous && this.privateList(scope).length >= 201)
        throw new BackupConflict("Private payment storage is full.");
      if (
        r.iv === profile.check.iv ||
        this.db
          .prepare(
            "SELECT 1 FROM link_backups WHERE owner=? AND chain=? AND contract=? AND vault=? AND iv=?",
          )
          .get(...this.params(scope), vault, r.iv)
      )
        throw new BackupConflict("Encryption nonce was reused.");
      this.db
        .prepare(
          "INSERT INTO private_payment_records VALUES (?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          ...this.params(scope),
          vault,
          r.id,
          r.kind,
          r.revision,
          r.iv,
          r.ciphertext,
          Date.now(),
        );
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
let store: LinkBackupStore | undefined;
export function linkBackupStore() {
  return (store ??= new LinkBackupStore(
    resolve(
      /* turbopackIgnore: true */ process.env.LINK_BACKUPS_DB_PATH ||
        resolve(
          dirname(process.env.CONTACTS_DB_PATH || "data/contacts.sqlite"),
          "link-backups.sqlite",
        ),
    ),
  ));
}
