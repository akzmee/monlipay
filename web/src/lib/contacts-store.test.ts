import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContactsStore, normalizeContact } from "./contacts-store";
import { type Address, zeroAddress } from "viem";

const alice = "0x1111111111111111111111111111111111111111" as Address;
const bob = "0x2222222222222222222222222222222222222222" as Address;
const friend = "0x3333333333333333333333333333333333333333" as Address;
const stores: ContactsStore[] = [];
const open = (path = ":memory:") => {
  const store = new ContactsStore(path);
  stores.push(store);
  return store;
};
afterEach(() => {
  stores.splice(0).forEach((store) => store.close());
});

describe("private contacts", () => {
  it("isolates reads, edits and deletes by the authenticated wallet", () => {
    const store = open();
    store.save(alice, { address: friend, name: "Alice's friend" });
    store.save(bob, { address: friend, name: "Bob's friend" });
    store.remove(alice, friend);
    expect(store.list(alice)).toEqual([]);
    expect(store.list(bob)).toEqual([
      { address: friend, name: "Bob's friend" },
    ]);
  });
  it("updates the existing wallet instead of creating duplicate contacts", () => {
    const store = open();
    store.save(alice, { address: friend, name: "First name" });
    store.save(alice, { address: friend, name: "  Renamed  " });
    expect(store.list(alice)).toEqual([{ address: friend, name: "Renamed" }]);
  });
  it("persists across a server restart", () => {
    const directory = mkdtempSync(join(tmpdir(), "monlipay-contacts-"));
    const path = join(directory, "contacts.sqlite");
    const first = new ContactsStore(path);
    first.save(alice, { address: friend, name: "Saved" });
    first.close();
    const second = new ContactsStore(path);
    try {
      expect(second.list(alice)).toEqual([{ address: friend, name: "Saved" }]);
    } finally {
      second.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("rejects invalid addresses and blank or oversized names", () => {
    for (const value of [
      null,
      {},
      { address: zeroAddress, name: "Zero" },
      { address: "bad", name: "Bad" },
      { address: bob, name: "  " },
      { address: bob, name: "a".repeat(61) },
    ])
      expect(() => normalizeContact(value)).toThrow();
  });
  it("bounds each address book without preventing edits at capacity", () => {
    const store = open();
    for (let i = 1; i <= 500; i++)
      store.save(alice, {
        address: `0x${i.toString(16).padStart(40, "0")}`,
        name: `Contact ${i}`,
      });
    expect(() =>
      store.save(alice, { address: friend, name: "Overflow" }),
    ).toThrow("full");
    expect(() =>
      store.save(alice, {
        address: "0x0000000000000000000000000000000000000001",
        name: "Updated",
      }),
    ).not.toThrow();
    expect(() =>
      store.save(bob, { address: friend, name: "Other book" }),
    ).not.toThrow();
  });
});

describe("wallet sign-in credentials", () => {
  it("consumes each challenge once even when two verifications race", () => {
    const store = open();
    const challenge = store.challenge(alice, (nonce) => `Sign ${nonce}`, 1000);
    expect(store.consumeChallenge(challenge.token, 1001)?.wallet).toBe(alice);
    expect(store.consumeChallenge(challenge.token, 1001)).toBeNull();
  });
  it("rejects expired and unknown challenges", () => {
    const store = open();
    const challenge = store.challenge(alice, () => "message", 1000);
    expect(store.consumeChallenge(challenge.token, 301000)).toBeNull();
    expect(store.consumeChallenge("guessed", 1000)).toBeNull();
  });
  it("expires sessions after an hour and revokes them on logout", () => {
    const store = open();
    const token = store.session(alice, 1000);
    expect(store.owner(token, 1001)).toBe(alice);
    expect(store.owner(token, 3601000)).toBeNull();
    const second = store.session(bob, 1000);
    store.logout(second);
    expect(store.owner(second, 1001)).toBeNull();
  });
});
