"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { TokenInfo } from "@/config/chain";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";

interface TokenSelectModalProps {
  open: boolean;
  onClose: () => void;
  tokens: TokenInfo[];
  selectedToken: TokenInfo;
  onSelect: (token: TokenInfo) => void;
  onAddCustomToken: (token: TokenInfo) => void;
  onRemoveCustomToken?: (address: string) => void;
  customTokenAddresses: Set<string>;
}

/**
 * Color palette for token avatar fallbacks (circle with first letter).
 * Deterministic based on symbol hash.
 */
const AVATAR_COLORS = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-cyan-600",
  "from-green-500 to-emerald-600",
  "from-amber-500 to-orange-600",
  "from-pink-500 to-rose-600",
  "from-indigo-500 to-blue-600",
  "from-teal-500 to-green-600",
  "from-fuchsia-500 to-purple-600",
];

function getAvatarColor(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function TokenAvatar({ token, size = 36 }: { token: TokenInfo; size?: number }) {
  if (token.logoURI) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={token.logoURI}
        alt={token.symbol}
        className="rounded-full"
        style={{ width: size, height: size }}
        onError={(e) => {
          // Fallback: hide image, show letter avatar
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-gradient-to-br ${getAvatarColor(token.symbol)} font-bold text-white`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {token.symbol.charAt(0)}
    </div>
  );
}

/**
 * DeFi-style token selector modal.
 *
 * Features:
 * - Searchable list of tokens (by symbol or name)
 * - Each token shows avatar, symbol, and full name
 * - "Import Token" section: paste contract address to add custom ERC-20
 * - Custom tokens can be removed
 *
 * Usage:
 *   <TokenSelectModal
 *     open={isOpen}
 *     onClose={() => setOpen(false)}
 *     tokens={allTokens}
 *     selectedToken={selected}
 *     onSelect={(t) => { setSelected(t); setOpen(false); }}
 *     onAddCustomToken={addToken}
 *     onRemoveCustomToken={removeToken}
 *     customTokenAddresses={customAddressesSet}
 *   />
 */
export function TokenSelectModal({
  open,
  onClose,
  tokens,
  selectedToken,
  onSelect,
  onAddCustomToken,
  onRemoveCustomToken,
  customTokenAddresses,
}: TokenSelectModalProps) {
  const [search, setSearch] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importAddress, setImportAddress] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const { metadata, isLoading: isLoadingToken, isError: isTokenError } = useTokenMetadata(
    showImport && importAddress.length >= 42 ? importAddress : null,
  );

  // Focus search when modal opens
  useEffect(() => {
    if (open && !showImport) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [open, showImport]);

  // Focus import input when import view opens
  useEffect(() => {
    if (showImport) {
      setTimeout(() => importInputRef.current?.focus(), 100);
    }
  }, [showImport]);

  // Reset search on close
  useEffect(() => {
    if (!open) {
      setSearch("");
      setShowImport(false);
      setImportAddress("");
    }
  }, [open]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const filteredTokens = useMemo(() => {
    if (!search.trim()) return tokens;
    const q = search.toLowerCase();
    return tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q),
    );
  }, [tokens, search]);

  const handleImportToken = () => {
    if (metadata) {
      onAddCustomToken(metadata);
      onSelect(metadata);
      setShowImport(false);
      setImportAddress("");
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-700">
          {showImport ? (
            <button
              onClick={() => setShowImport(false)}
              className="flex items-center gap-1 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Back
            </button>
          ) : (
            <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
              Select a token
            </h2>
          )}
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {showImport ? (
          // Import token view
          <div className="flex-1 overflow-y-auto p-4">
            <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
              Paste the ERC-20 token contract address. We'll fetch the token metadata
              from the chain.
            </p>
            <div className="flex gap-2">
              <input
                ref={importInputRef}
                type="text"
                placeholder="0x... contract address"
                value={importAddress}
                onChange={(e) => setImportAddress(e.target.value)}
                className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm font-mono outline-none transition-colors placeholder:font-sans placeholder:text-stone-400 focus:border-violet-400 dark:border-stone-700 dark:bg-stone-800 dark:focus:border-violet-500"
                spellCheck={false}
                autoComplete="off"
              />
            </div>

            {/* Loading state */}
            {isLoadingToken && (
              <div className="mt-3 flex items-center gap-2 text-xs text-stone-500">
                <svg className="h-4 w-4 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Fetching token metadata...
              </div>
            )}

            {/* Success preview */}
            {metadata && (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/30">
                <TokenAvatar token={metadata} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-stone-900 dark:text-stone-100">{metadata.symbol}</span>
                    <span className="rounded bg-green-200 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                      {metadata.decimals} decimals
                    </span>
                  </div>
                  <p className="truncate text-xs text-stone-500 dark:text-stone-400">{metadata.name}</p>
                  <p className="truncate font-mono text-[10px] text-stone-400">{metadata.address}</p>
                </div>
              </div>
            )}

            {/* Error state */}
            {isTokenError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                No valid ERC-20 token found at this address. Make sure you're on the
                correct network.
              </div>
            )}

            {/* Import button */}
            <button
              onClick={handleImportToken}
              disabled={!metadata}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 py-3 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-purple-500 disabled:cursor-not-allowed disabled:from-stone-400 disabled:to-stone-400"
            >
              {metadata ? `Import ${metadata.symbol}` : "Import Token"}
            </button>
          </div>
        ) : (
          // Token list view
          <>
            {/* Search bar */}
            <div className="border-b border-stone-200 p-3 dark:border-stone-700">
              <div className="relative">
                <svg
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search name or paste address"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-stone-400 focus:border-violet-400 focus:bg-white dark:border-stone-700 dark:bg-stone-800 dark:focus:border-violet-500 dark:focus:bg-stone-800"
                />
              </div>
            </div>

            {/* Token list */}
            <div className="flex-1 overflow-y-auto p-2">
              {filteredTokens.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-stone-500 dark:text-stone-400">No tokens found</p>
                  <button
                    onClick={() => {
                      setShowImport(true);
                      setImportAddress(search);
                    }}
                    className="mt-2 text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
                  >
                    Import "{search}" as custom token
                  </button>
                </div>
              ) : (
                filteredTokens.map((token) => {
                  const isSelected = selectedToken.address.toLowerCase() === token.address.toLowerCase();
                  const isCustom = customTokenAddresses.has(token.address.toLowerCase());
                  return (
                    <div
                      key={token.address}
                      className="group flex items-center"
                    >
                      <button
                        onClick={() => {
                          onSelect(token);
                          onClose();
                        }}
                        className={`flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                          isSelected
                            ? "bg-violet-50 dark:bg-violet-950/30"
                            : "hover:bg-stone-100 dark:hover:bg-stone-800"
                        }`}
                      >
                        <TokenAvatar token={token} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-stone-900 dark:text-stone-100">
                              {token.symbol}
                            </span>
                            {isCustom && (
                              <span className="rounded bg-violet-100 px-1 py-0.5 text-[9px] font-medium text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
                                CUSTOM
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                            {token.name}
                          </p>
                        </div>
                        {isSelected && (
                          <svg className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </button>
                      {/* Remove custom token */}
                      {isCustom && onRemoveCustomToken && (
                        <button
                          onClick={() => onRemoveCustomToken(token.address)}
                          className="mr-2 hidden h-7 w-7 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500 group-hover:flex dark:hover:bg-red-950/30"
                          aria-label={`Remove ${token.symbol}`}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer — Import custom token */}
            <div className="border-t border-stone-200 p-3 dark:border-stone-700">
              <button
                onClick={() => setShowImport(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50 hover:text-stone-900 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Import Custom Token
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
