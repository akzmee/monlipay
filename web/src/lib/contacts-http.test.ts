import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkOrigin,
  contactOwner,
  readCookie,
  readJson,
  SESSION_COOKIE,
  sessionCookie,
} from "./contacts-http";
import * as persistence from "./contacts-store";
import { type Address } from "viem";
const wallet = "0x1111111111111111111111111111111111111111" as Address;
const another = "0x2222222222222222222222222222222222222222";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("contacts HTTP boundary", () => {
  it("requires the configured origin for mutations", () => {
    vi.stubEnv("APP_ORIGIN", "https://monlipay.test");
    expect(() =>
      checkOrigin(
        new Request("https://internal/api", {
          headers: { origin: "https://monlipay.test" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      checkOrigin(
        new Request("https://internal/api", {
          headers: { origin: "https://attacker.test" },
        }),
      ),
    ).toThrow();
    expect(() => checkOrigin(new Request("https://internal/api"))).toThrow();
  });
  it("protects cookie credentials from scripts and cross-site requests", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookie(SESSION_COOKIE, "abc", 60)).toContain(
      "HttpOnly; SameSite=Strict; Path=/; Max-Age=60; Secure",
    );
    expect(
      readCookie(
        new Request("https://test", {
          headers: { cookie: `${SESSION_COOKIE}=tampered` },
        }),
        SESSION_COOKIE,
      ),
    ).toBe("");
  });
  it("rejects account switches, unauthenticated reads and cross-site reads", () => {
    const store = new persistence.ContactsStore(":memory:");
    vi.spyOn(persistence, "contactsStore").mockReturnValue(store);
    const token = store.session(wallet);
    const request = (owner = wallet, site = "same-origin", cookie = token) =>
      new Request("https://test/api", {
        headers: {
          "x-wallet-address": owner,
          "sec-fetch-site": site,
          cookie: `${SESSION_COOKIE}=${cookie}`,
        },
      });
    try {
      expect(contactOwner(request())).toBe(wallet);
      expect(contactOwner(request(another as Address))).toBeNull();
      expect(contactOwner(request(wallet, "cross-site"))).toBeNull();
      expect(contactOwner(request(wallet, "same-origin", ""))).toBeNull();
    } finally {
      store.close();
    }
  });
  it("accepts bounded JSON objects and rejects oversized or malformed bodies", async () => {
    const request = (body: string) =>
      new Request("https://test", {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
      });
    await expect(readJson(request('{"name":"Sam"}'))).resolves.toEqual({
      name: "Sam",
    });
    for (const input of [
      "null",
      "[]",
      "{broken",
      JSON.stringify({ name: "a".repeat(8200) }),
    ])
      await expect(readJson(request(input))).rejects.toThrow();
  });
});
