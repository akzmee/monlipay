import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { getAddress, isAddress, zeroAddress, type Address } from "viem";

export type Contact = { address: Address; name: string };
type Challenge = { wallet: Address; message: string; expires: number };
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const opaqueToken = () => randomBytes(32).toString("hex");

export function normalizeContact(value: unknown): Contact {
  const row = value as Partial<Contact> | null;
  if (
    !row ||
    typeof row.address !== "string" ||
    !isAddress(row.address) ||
    row.address === zeroAddress
  )
    throw new Error("Enter a valid wallet address.");
  if (
    typeof row.name !== "string" ||
    !row.name.trim() ||
    row.name.trim().length > 60
  )
    throw new Error("Use a contact name between 1 and 60 characters.");
  return { address: getAddress(row.address), name: row.name.trim() };
}

/** Persistent, owner-scoped address book. Tokens are stored as hashes, never as bearer credentials. */
export class ContactsStore {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS contacts (
        owner TEXT NOT NULL, address TEXT NOT NULL, name TEXT NOT NULL,
        PRIMARY KEY (owner, address));
      CREATE TABLE IF NOT EXISTS challenges (
        token TEXT PRIMARY KEY, wallet TEXT NOT NULL, message TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY, wallet TEXT NOT NULL, expires INTEGER NOT NULL);`);
  }
  close() {
    this.db.close();
  }
  list(owner: string): Contact[] {
    return this.db
      .prepare(
        "SELECT address, name FROM contacts WHERE owner = ? ORDER BY name COLLATE NOCASE, address",
      )
      .all(owner.toLowerCase())
      .map((row) => ({
        address: getAddress(String(row.address)),
        name: String(row.name),
      }));
  }
  save(owner: string, value: unknown): Contact {
    const contact = normalizeContact(value);
    const normalizedOwner = owner.toLowerCase();
    const address = contact.address.toLowerCase();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db
        .prepare("SELECT 1 FROM contacts WHERE owner = ? AND address = ?")
        .get(normalizedOwner, address);
      const count = this.db
        .prepare("SELECT COUNT(*) AS count FROM contacts WHERE owner = ?")
        .get(normalizedOwner);
      if (!existing && Number(count?.count) >= 500)
        throw new Error("Your address book is full (500 contacts).");
      this.db
        .prepare(
          "INSERT INTO contacts(owner, address, name) VALUES (?, ?, ?) ON CONFLICT(owner, address) DO UPDATE SET name=excluded.name",
        )
        .run(normalizedOwner, address, contact.name);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return contact;
  }
  remove(owner: string, address: string) {
    this.db
      .prepare("DELETE FROM contacts WHERE owner = ? AND address = ?")
      .run(owner.toLowerCase(), address.toLowerCase());
  }
  challenge(
    wallet: Address,
    message: (nonce: string, expires: number) => string,
    now = Date.now(),
  ) {
    this.prune(now);
    const token = opaqueToken();
    const expires = now + 5 * 60_000;
    const text = message(opaqueToken(), expires);
    this.db
      .prepare("INSERT INTO challenges VALUES (?, ?, ?, ?)")
      .run(hash(token), wallet, text, expires);
    return { token, message: text };
  }
  consumeChallenge(token: string, now = Date.now()): Challenge | null {
    const row = this.db
      .prepare(
        "DELETE FROM challenges WHERE token = ? RETURNING wallet, message, expires",
      )
      .get(hash(token));
    if (!row || Number(row.expires) <= now) return null;
    return {
      wallet: getAddress(String(row.wallet)),
      message: String(row.message),
      expires: Number(row.expires),
    };
  }
  session(wallet: Address, now = Date.now()) {
    this.prune(now);
    const token = opaqueToken();
    this.db
      .prepare("INSERT INTO sessions VALUES (?, ?, ?)")
      .run(hash(token), wallet.toLowerCase(), now + 3_600_000);
    return token;
  }
  owner(token: string, now = Date.now()): Address | null {
    const row = this.db
      .prepare("SELECT wallet FROM sessions WHERE token = ? AND expires > ?")
      .get(hash(token), now);
    return row ? getAddress(String(row.wallet)) : null;
  }
  logout(token: string) {
    this.db.prepare("DELETE FROM sessions WHERE token = ?").run(hash(token));
  }
  private prune(now: number) {
    this.db.prepare("DELETE FROM sessions WHERE expires <= ?").run(now);
    this.db.prepare("DELETE FROM challenges WHERE expires <= ?").run(now);
  }
}

let store: ContactsStore | undefined;
export function contactsStore() {
  return (store ??= new ContactsStore(
    resolve(
      /* turbopackIgnore: true */ process.env.CONTACTS_DB_PATH ||
        "data/contacts.sqlite",
    ),
  ));
}
