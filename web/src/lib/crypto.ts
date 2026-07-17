import {
  bytesToHex,
  hexToBytes,
  type Hex,
} from "viem";
import {
  generatePrivateKey,
  privateKeyToAccount,
} from "viem/accounts";

/**
 * Cryptographic utilities for the payment link flow.
 *
 * Secret mechanism:
 * 1. Sender generates a random private key in the browser.
 * 2. claimKey = address derived from that private key, stored on-chain.
 * 3. The private key goes into the URL fragment (#) so it never hits a server.
 * 4. Recipient signs (depositId, recipient) with the private key.
 * 5. Contract verifies via ecrecover — prevents front-running.
 */

// ---------------------------------------------------------------------------
// Base58 encoding (Bitcoin alphabet, URL-safe, no +/= or 0/O ambiguity)
// Used to compress the 32-byte private key in the URL fragment from
// 66 hex chars down to ~44 base58 chars.
// ---------------------------------------------------------------------------
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function bytesToBase58(bytes: Uint8Array): string {
  // Count leading zero bytes → encoded as "1" prefix
  let zeros = 0;
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) zeros++;

  // Convert base-256 → base-58
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let result = "";
  for (let i = 0; i < zeros; i++) result += BASE58_ALPHABET[0];
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

function base58ToBytes(str: string): Uint8Array | null {
  if (str.length === 0) return null;

  // Map each char → index, reject invalid chars
  const indexes: number[] = [];
  for (const ch of str) {
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx === -1) return null;
    indexes.push(idx);
  }

  // Count leading "1"s (encoded leading zero bytes)
  let zeros = 0;
  while (zeros < indexes.length && indexes[zeros] === 0) zeros++;

  // Convert base-58 → base-256
  const bytes: number[] = [];
  for (let i = zeros; i < indexes.length; i++) {
    let carry = indexes[i];
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  const result = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < zeros; i++) result[i] = 0;
  for (let i = 0; i < bytes.length; i++) result[zeros + i] = bytes[bytes.length - 1 - i];
  return result;
}

/**
 * Generate a cryptographically secure random private key.
 * Uses viem's generatePrivateKey which wraps crypto.getRandomValues.
 */
export function generateSecretKey(): Hex {
  return generatePrivateKey();
}

/**
 * Derive the claim key address from a private key.
 * This address is stored on-chain so the contract can verify signatures.
 */
export function privateKeyToClaimKey(privateKey: Hex): `0x${string}` {
  const account = privateKeyToAccount(privateKey);
  return account.address;
}

/**
 * Sign the claim message for a payment link.
 * Uses EIP-712 typed data signing for security (domain separation).
 *
 * The signature proves the signer holds the secret key associated with
 * the claimKey stored in the deposit.
 */
export async function signClaim(params: {
  privateKey: Hex;
  depositId: bigint;
  recipient: `0x${string}`;
  chainId: number;
  verifyingContract: `0x${string}`;
}): Promise<{ v: number; r: Hex; s: Hex }> {
  const { privateKey, depositId, recipient, chainId, verifyingContract } = params;

  const account = privateKeyToAccount(privateKey);

  // EIP-712 typed data — matches the contract's domain and typehash
  const signature = await account.signTypedData({
    domain: {
      name: "LinkVault",
      version: "1",
      chainId: BigInt(chainId),
      verifyingContract,
    },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Claim: [
        { name: "depositId", type: "uint256" },
        { name: "recipient", type: "address" },
      ],
    },
    primaryType: "Claim",
    message: {
      depositId,
      recipient,
    },
  });

  // Split signature into v, r, s components for the contract call
  const sigBytes = hexToBytes(signature);
  const r = bytesToHex(sigBytes.slice(0, 32)) as Hex;
  const s = bytesToHex(sigBytes.slice(32, 64)) as Hex;
  let v = sigBytes[64];
  // Normalize v: Ethereum uses 27 or 28, some signers produce 0 or 1
  if (v < 27) v += 27;

  return { v, r, s };
}

// ---------------------------------------------------------------------------
// URL hash format
//
// **Compact (current):**  #<depositId>-<base58key>
//   Example: #42-5Kd3NBU5...   (depositId in decimal, key in base58, ~44 chars)
//
// **Legacy (still parseable):**  #<depositId>/<0xhexkey>
//   Example: #42/0x1234...abcd  (depositId in decimal, key as 0x-prefixed hex)
//
// Both formats are supported by parseClaimUrl for backward compatibility.
// ---------------------------------------------------------------------------

/**
 * Parse the secret key and deposit ID from a URL hash.
 * Supports both the compact base58 format (#42-XXXX) and the legacy
 * hex format (#42/0xXXXX).
 *
 * SECURITY: Rejects negative deposit IDs. A negative id parsed via BigInt
 * ("-42") would be cast to uint256 by the contract (wrapping to a huge
 * number), causing confusing "deposit not found" errors at best, and
 * potentially matching an unrelated deposit at worst. We fail closed.
 */
export function parseClaimUrl(hash: string): { depositId: bigint; secretKey: Hex } | null {
  // Remove leading #
  const clean = hash.startsWith("#") ? hash.slice(1) : hash;

  // --- Compact format: #<depositId>-<base58key> ---
  const dashIdx = clean.indexOf("-");
  if (dashIdx > 0) {
    const idStr = clean.slice(0, dashIdx);
    const keyStr = clean.slice(dashIdx + 1);
    try {
      const depositId = BigInt(idStr);
      if (depositId < 0n) return null;
      const keyBytes = base58ToBytes(keyStr);
      if (!keyBytes || keyBytes.length !== 32) return null;
      const secretKey = bytesToHex(keyBytes) as Hex;
      return { depositId, secretKey };
    } catch {
      return null;
    }
  }

  // --- Legacy format: #<depositId>/<0xhexkey> ---
  const parts = clean.split("/");
  if (parts.length !== 2) return null;

  const idStr = parts[0];
  const keyStr = parts[1];

  try {
    const depositId = BigInt(idStr);
    if (depositId < 0n) return null;
    if (!keyStr.startsWith("0x") || keyStr.length !== 66) return null;
    return { depositId, secretKey: keyStr as Hex };
  } catch {
    return null;
  }
}

/**
 * Build a claim URL hash from deposit ID and secret key.
 * Uses the compact base58 format: #<depositId>-<base58key>
 */
export function buildClaimHash(depositId: bigint, secretKey: Hex): string {
  const keyBytes = hexToBytes(secretKey);
  const b58Key = bytesToBase58(keyBytes);
  return `#${depositId.toString()}-${b58Key}`;
}

/**
 * Encode a claim URL for sharing (e.g., WhatsApp, Telegram).
 * Uses the compact base58 format for shorter URLs.
 *
 * MEDIUM-7: The baseUrl is validated to be an http(s) URL. This prevents
 * `javascript:` or `data:` URLs from being embedded in the shareable link
 * (which would execute in the recipient's browser if they click the link
 * from certain messengers that don't sanitize URL schemes). In production
 * only https is allowed; localhost over http is allowed for dev.
 */
export function buildShareableUrl(
  baseUrl: string,
  depositId: bigint,
  secretKey: Hex,
): string {
  const safeBase = sanitizeBaseUrl(baseUrl);
  return `${safeBase}/claim${buildClaimHash(depositId, secretKey)}`;
}

/**
 * Validate and normalize a base URL for embedding in shareable links.
 * Returns the origin only (strips path/query/hash) to prevent open-redirect
 * and exfiltration tricks like `https://monlipay.xyz@evil.com/`.
 *
 * Rejects:
 *   - non-http(s) schemes (javascript:, data:, blob:, file:, etc.)
 *   - URLs with embedded credentials (`https://user:pass@host`)
 *   - URLs where the host contains `@` (user-info separator)
 *
 * In production, restricts to https only. Allows http for localhost/dev.
 */
export function sanitizeBaseUrl(baseUrl: string): string {
  if (typeof baseUrl !== "string" || baseUrl.length === 0) {
    throw new Error("sanitizeBaseUrl: empty baseUrl");
  }
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`sanitizeBaseUrl: invalid URL "${baseUrl}"`);
  }
  const proto = url.protocol.toLowerCase();
  if (proto !== "https:" && proto !== "http:") {
    throw new Error(`sanitizeBaseUrl: disallowed scheme "${url.protocol}"`);
  }
  // Reject user-info in URL (prevents `https://x@evil.com` tricks)
  if (url.username || url.password) {
    throw new Error("sanitizeBaseUrl: credentials in URL not allowed");
  }
  if (url.hostname.includes("@")) {
    throw new Error("sanitizeBaseUrl: '@' in hostname not allowed");
  }
  // In production (non-localhost), require https
  const isLocalhost =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]" ||
    url.hostname.endsWith(".localhost");
  if (!isLocalhost && proto !== "https:") {
    throw new Error(`sanitizeBaseUrl: http not allowed for non-localhost host "${url.hostname}"`);
  }
  // Return origin only — strip any path/query/hash to prevent injection
  return url.origin;
}
