import { describe, it, expect } from "vitest";
import {
  generateSecretKey,
  privateKeyToClaimKey,
  signClaim,
  parseClaimUrl,
  buildClaimHash,
  buildShareableUrl,
} from "@/lib/crypto";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

describe("crypto", () => {
  // -----------------------------------------------------------------
  // generateSecretKey
  // -----------------------------------------------------------------
  describe("generateSecretKey", () => {
    it("should generate a valid 32-byte hex private key", () => {
      const key = generateSecretKey();
      expect(key).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("should generate unique keys on each call", () => {
      const key1 = generateSecretKey();
      const key2 = generateSecretKey();
      expect(key1).not.toBe(key2);
    });
  });

  // -----------------------------------------------------------------
  // privateKeyToClaimKey
  // -----------------------------------------------------------------
  describe("privateKeyToClaimKey", () => {
    it("should derive the correct address from a known private key", () => {
      const privateKey =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex;
      const account = privateKeyToAccount(privateKey);
      const claimKey = privateKeyToClaimKey(privateKey);
      expect(claimKey).toBe(account.address);
      expect(claimKey).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it("should produce consistent results for the same key", () => {
      const privateKey = generateSecretKey();
      const claimKey1 = privateKeyToClaimKey(privateKey);
      const claimKey2 = privateKeyToClaimKey(privateKey);
      expect(claimKey1).toBe(claimKey2);
    });

    it("should produce different addresses for different keys", () => {
      const key1 = generateSecretKey();
      const key2 = generateSecretKey();
      const claimKey1 = privateKeyToClaimKey(key1);
      const claimKey2 = privateKeyToClaimKey(key2);
      expect(claimKey1).not.toBe(claimKey2);
    });
  });

  // -----------------------------------------------------------------
  // signClaim
  // -----------------------------------------------------------------
  describe("signClaim", () => {
    it("should produce valid v, r, s components", async () => {
      const privateKey = generateSecretKey();
      const result = await signClaim({
        privateKey,
        depositId: 1n,
        recipient: "0x1234567890123456789012345678901234567890" as `0x${string}`,
        chainId: 10143,
        verifyingContract:
          "0xabcd000000000000000000000000000000000000" as `0x${string}`,
      });

      expect(result.v).toBeGreaterThanOrEqual(27);
      expect(result.v).toBeLessThanOrEqual(28);
      expect(result.r).toMatch(/^0x[0-9a-f]{64}$/);
      expect(result.s).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("should produce different signatures for different deposit IDs", async () => {
      const privateKey = generateSecretKey();
      const recipient = "0x1234567890123456789012345678901234567890" as `0x${string}`;

      const sig1 = await signClaim({
        privateKey,
        depositId: 1n,
        recipient,
        chainId: 10143,
        verifyingContract: "0xabcd000000000000000000000000000000000000" as `0x${string}`,
      });
      const sig2 = await signClaim({
        privateKey,
        depositId: 2n,
        recipient,
        chainId: 10143,
        verifyingContract: "0xabcd000000000000000000000000000000000000" as `0x${string}`,
      });

      expect(sig1.r).not.toBe(sig2.r);
    });

    it("should produce different signatures for different recipients", async () => {
      const privateKey = generateSecretKey();

      const sig1 = await signClaim({
        privateKey,
        depositId: 1n,
        recipient: "0x1111111111111111111111111111111111111111" as `0x${string}`,
        chainId: 10143,
        verifyingContract: "0xabcd000000000000000000000000000000000000" as `0x${string}`,
      });
      const sig2 = await signClaim({
        privateKey,
        depositId: 1n,
        recipient: "0x2222222222222222222222222222222222222222" as `0x${string}`,
        chainId: 10143,
        verifyingContract: "0xabcd000000000000000000000000000000000000" as `0x${string}`,
      });

      expect(sig1.r).not.toBe(sig2.r);
    });

    it("should produce different signatures for different chain IDs", async () => {
      const privateKey = generateSecretKey();
      const recipient = "0x1234567890123456789012345678901234567890" as `0x${string}`;

      const sig1 = await signClaim({
        privateKey,
        depositId: 1n,
        recipient,
        chainId: 10143,
        verifyingContract: "0xabcd000000000000000000000000000000000000" as `0x${string}`,
      });
      const sig2 = await signClaim({
        privateKey,
        depositId: 1n,
        recipient,
        chainId: 1,
        verifyingContract: "0xabcd000000000000000000000000000000000000" as `0x${string}`,
      });

      expect(sig1.r).not.toBe(sig2.r);
    });
  });

  // -----------------------------------------------------------------
  // parseClaimUrl — compact base58 format (#42-XXXX)
  // -----------------------------------------------------------------
  describe("parseClaimUrl — compact format", () => {
    it("should parse a compact base58 URL hash", () => {
      // Use a real 32-byte key so base58 round-trips correctly
      const key = generateSecretKey();
      const hash = buildClaimHash(42n, key);
      const result = parseClaimUrl(hash);
      expect(result).toEqual({
        depositId: 42n,
        secretKey: key,
      });
    });

    it("should parse compact format without leading #", () => {
      const key = generateSecretKey();
      const hash = buildClaimHash(7n, key).slice(1); // strip #
      const result = parseClaimUrl(hash);
      expect(result?.depositId).toBe(7n);
      expect(result?.secretKey).toBe(key);
    });

    it("should handle deposit ID of 0 in compact format", () => {
      const key = generateSecretKey();
      const hash = buildClaimHash(0n, key);
      const result = parseClaimUrl(hash);
      expect(result?.depositId).toBe(0n);
    });

    it("should handle very large deposit IDs in compact format", () => {
      const key = generateSecretKey();
      const hash = buildClaimHash(999999999999n, key);
      const result = parseClaimUrl(hash);
      expect(result?.depositId).toBe(999999999999n);
    });
  });

  // -----------------------------------------------------------------
  // parseClaimUrl — legacy hex format (#42/0xXXXX) for backward compat
  // -----------------------------------------------------------------
  describe("parseClaimUrl — legacy hex format", () => {
    const validKey =
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex;

    it("should parse a legacy hex URL hash", () => {
      const hash = `#42/${validKey}`;
      const result = parseClaimUrl(hash);
      expect(result).toEqual({
        depositId: 42n,
        secretKey: validKey,
      });
    });

    it("should parse legacy format without leading #", () => {
      const hash = `7/${validKey}`;
      const result = parseClaimUrl(hash);
      expect(result).toEqual({
        depositId: 7n,
        secretKey: validKey,
      });
    });

    it("should return null for empty string", () => {
      expect(parseClaimUrl("")).toBeNull();
    });

    it("should return null for missing parts in legacy format", () => {
      expect(parseClaimUrl("#42")).toBeNull();
    });

    it("should return null for too many parts in legacy format", () => {
      expect(parseClaimUrl(`#42/${validKey}/extra`)).toBeNull();
    });

    it("should return null for invalid deposit ID in legacy format", () => {
      expect(parseClaimUrl(`#abc/${validKey}`)).toBeNull();
    });

    it("should return null for key without 0x prefix in legacy format", () => {
      expect(parseClaimUrl("#42/1234567890abcdef")).toBeNull();
    });

    it("should return null for key with wrong length in legacy format", () => {
      expect(parseClaimUrl("#42/0x1234")).toBeNull();
    });
  });

  // -----------------------------------------------------------------
  // buildClaimHash
  // -----------------------------------------------------------------
  describe("buildClaimHash", () => {
    it("should build a compact hash with dash separator", () => {
      const key = generateSecretKey();
      const hash = buildClaimHash(42n, key);
      // Format: #<id>-<base58key>
      expect(hash).toMatch(/^#42-/);
      // Base58 key should be shorter than hex key
      const b58Part = hash.slice(4); // after "#42-"
      expect(b58Part.length).toBeLessThan(66); // hex is 66 chars
      expect(b58Part.length).toBeGreaterThan(0);
    });

    it("should handle large deposit IDs", () => {
      const key = generateSecretKey();
      const hash = buildClaimHash(999999999999n, key);
      expect(hash).toMatch(/^#999999999999-/);
    });

    it("should handle deposit ID of 0", () => {
      const key = generateSecretKey();
      const hash = buildClaimHash(0n, key);
      expect(hash).toMatch(/^#0-/);
    });

    it("should produce a shorter key than hex encoding", () => {
      const key = generateSecretKey();
      const hash = buildClaimHash(42n, key);
      const b58Part = hash.slice(hash.indexOf("-") + 1);
      // 32 bytes in base58 ≈ 44 chars, hex is 66 chars
      expect(b58Part.length).toBeLessThanOrEqual(52);
      expect(b58Part.length).toBeGreaterThanOrEqual(40);
    });
  });

  // -----------------------------------------------------------------
  // buildShareableUrl
  // -----------------------------------------------------------------
  describe("buildShareableUrl", () => {
    it("should build a correct full URL with compact format", () => {
      const key = generateSecretKey();
      const url = buildShareableUrl("https://example.com", 42n, key);
      expect(url).toMatch(/^https:\/\/example\.com\/claim#42-/);
    });

    it("should handle base URL with trailing slash", () => {
      const key = generateSecretKey();
      const url = buildShareableUrl("https://example.com/", 42n, key);
      // The function doesn't strip trailing slashes, just appends /claim
      expect(url).toMatch(/^https:\/\/example\.com\/\/claim#42-/);
    });

    it("should handle empty base URL", () => {
      const key = generateSecretKey();
      const url = buildShareableUrl("", 42n, key);
      expect(url).toMatch(/^\/claim#42-/);
    });
  });

  // -----------------------------------------------------------------
  // Round-trip: build then parse
  // -----------------------------------------------------------------
  describe("round-trip", () => {
    it("should correctly round-trip build → parse (compact format)", () => {
      const key = generateSecretKey();
      const depositId = 123n;
      const hash = buildClaimHash(depositId, key);
      const parsed = parseClaimUrl(hash);

      expect(parsed).toEqual({
        depositId,
        secretKey: key,
      });
    });

    it("should correctly round-trip full URL (compact format)", () => {
      const key = generateSecretKey();
      const depositId = 456n;
      const url = buildShareableUrl("https://monlipay.app", depositId, key);
      const hashIndex = url.indexOf("#");
      const hash = url.slice(hashIndex);
      const parsed = parseClaimUrl(hash);

      expect(parsed).toEqual({
        depositId,
        secretKey: key,
      });
    });

    it("should correctly parse a legacy-format URL built manually", () => {
      const key =
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex;
      const hash = `#42/${key}`;
      const parsed = parseClaimUrl(hash);

      expect(parsed).toEqual({
        depositId: 42n,
        secretKey: key,
      });
    });

    it("should produce shorter URLs than the legacy format", () => {
      const key = generateSecretKey();
      const depositId = 42n;

      const compactUrl = buildShareableUrl("https://monlipay.app", depositId, key);
      const legacyUrl = `https://monlipay.app/claim#${depositId}/${key}`;

      expect(compactUrl.length).toBeLessThan(legacyUrl.length);
      // Should save ~20 chars from base58 encoding
      const savings = legacyUrl.length - compactUrl.length;
      expect(savings).toBeGreaterThanOrEqual(15);
    });
  });
});
