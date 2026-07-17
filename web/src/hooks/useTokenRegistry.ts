"use client";

import { useState, useEffect, useCallback } from "react";
import { SUPPORTED_TOKENS, type TokenInfo } from "@/config/chain";
import { getCustomTokens, addCustomToken, removeCustomToken } from "@/lib/tokenStorage";

/**
 * Combined token list: preset tokens + user-added custom tokens from localStorage.
 *
 * This gives users a dropdown of known tokens (MON, plus any they've previously
 * added) so they don't need to re-enter contract addresses every time.
 *
 * Usage:
 *   const { tokens, addToken, removeToken } = useTokenRegistry();
 *   // tokens = [...SUPPORTED_TOKENS, ...customTokensFromLocalStorage]
 */
export function useTokenRegistry() {
  const [customTokens, setCustomTokens] = useState<TokenInfo[]>([]);

  useEffect(() => {
    setCustomTokens(getCustomTokens());
  }, []);

  const addToken = useCallback((token: TokenInfo) => {
    addCustomToken(token);
    setCustomTokens(getCustomTokens());
  }, []);

  const removeToken = useCallback((address: string) => {
    removeCustomToken(address);
    setCustomTokens(getCustomTokens());
  }, []);

  const allTokens: TokenInfo[] = [...SUPPORTED_TOKENS, ...customTokens];

  return { tokens: allTokens, customTokens, addToken, removeToken };
}
