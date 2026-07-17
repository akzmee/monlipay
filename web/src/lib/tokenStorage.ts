/**
 * LocalStorage-based token registry.
 *
 * Stores custom ERC-20 tokens that the user has added via the "Custom" flow.
 * These persist across sessions so the user doesn't need to re-enter the
 * contract address every time.
 *
 * This is client-side only — no backend needed. On mainnet, the static
 * SUPPORTED_TOKENS list in chain.ts handles well-known tokens, and this
 * registry handles any user-added tokens.
 */

import type { TokenInfo } from "@/config/chain";

const STORAGE_KEY = "monlipay_custom_tokens";

/**
 * Read all custom tokens from localStorage.
 */
export function getCustomTokens(): TokenInfo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TokenInfo[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t) =>
        t &&
        typeof t.address === "string" &&
        typeof t.symbol === "string" &&
        typeof t.decimals === "number" &&
        t.isNative === false,
    );
  } catch {
    return [];
  }
}

/**
 * Add a custom token to localStorage. Deduplicates by address.
 */
export function addCustomToken(token: TokenInfo): void {
  if (typeof window === "undefined") return;
  if (token.isNative) return; // Don't store native token
  const tokens = getCustomTokens();
  if (tokens.some((t) => t.address.toLowerCase() === token.address.toLowerCase())) return;
  tokens.push(token);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

/**
 * Remove a custom token by address.
 */
export function removeCustomToken(address: string): void {
  if (typeof window === "undefined") return;
  const tokens = getCustomTokens().filter(
    (t) => t.address.toLowerCase() !== address.toLowerCase(),
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}
