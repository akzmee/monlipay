"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { TokenAvatar } from "./TokenAvatar";

/**
 * Minimal token shape that both TokenInfo (create page) and BridgeToken
 * (bridge page) satisfy. This lets TokenSelectModal work in both contexts.
 */
export interface ModalToken {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  isNative?: boolean;
  logoURI?: string;
}

interface TokenSelectModalProps {
  open: boolean;
  onClose: () => void;
  tokens: ModalToken[];
  selectedToken: ModalToken;
  onSelect: (token: ModalToken) => void;
  onAddCustomToken?: (token: ModalToken) => void;
  onRemoveCustomToken?: (address: string) => void;
  customTokenAddresses?: Set<string>;
  /** Hide the "Import Custom Token" footer (e.g. on bridge page). */
  hideImport?: boolean;
}

/**
 * Truncate an Ethereum address: 0x1234…abcd
 */
function truncateAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * DeFi-native token selector modal.
 *
 * Features:
 * - Searchable list (by symbol, name, or address)
 * - Each row: logo, symbol (bold), name + truncated address (muted, small)
 * - "Import Token" section: paste contract address to add custom ERC-20
 * - Custom tokens removable via hover trash icon
 * - Animated enter/exit via motion (backdrop fade + panel slide-up on mobile,
 *   scale-in on desktop; respects prefers-reduced-motion automatically)
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
  hideImport = false,
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
      const t = setTimeout(() => searchInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open, showImport]);

  // Focus import input when import view opens
  useEffect(() => {
    if (showImport) {
      const t = setTimeout(() => importInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [showImport]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setSearch("");
        setShowImport(false);
        setImportAddress("");
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Escape to close
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
    if (metadata && onAddCustomToken) {
      onAddCustomToken(metadata);
      onSelect(metadata);
      setShowImport(false);
      setImportAddress("");
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-md sm:items-center"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: "100%", opacity: 0.5, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: "100%", opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3.5 dark:border-stone-700">
              {showImport ? (
                <button
                  onClick={() => setShowImport(false)}
                  className="flex items-center gap-1.5 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                  Back
                </button>
              ) : (
                <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                  Select a token
                </h2>
              )}
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {showImport && onAddCustomToken ? (
              // --- Import view ---
              <div className="flex-1 overflow-y-auto p-4">
                <p className="mb-3 text-xs text-stone-500 dark:text-stone-400">
                  Paste the ERC-20 token contract address. We&apos;ll fetch the
                  metadata on-chain.
                </p>
                <input
                  ref={importInputRef}
                  type="text"
                  placeholder="0x… contract address"
                  value={importAddress}
                  onChange={(e) => setImportAddress(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-sm font-mono outline-none transition-colors placeholder:font-sans placeholder:text-stone-400 focus:border-violet-400 focus:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:focus:border-violet-500"
                  spellCheck={false}
                  autoComplete="off"
                />

                {/* Loading */}
                {isLoadingToken && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                    <svg className="h-4 w-4 animate-spin text-violet-500" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Fetching metadata…
                  </div>
                )}

                {/* Success preview */}
                {metadata && (
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                    <TokenAvatar token={metadata} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-900 dark:text-stone-100">{metadata.symbol}</span>
                        <span className="rounded bg-emerald-200 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                          {metadata.decimals} decimals
                        </span>
                      </div>
                      <p className="truncate text-xs text-stone-500 dark:text-stone-400">{metadata.name}</p>
                      <p className="truncate font-mono text-[10px] text-stone-400">{truncateAddress(metadata.address)}</p>
                    </div>
                  </div>
                )}

                {/* Error */}
                {isTokenError && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                    No valid ERC-20 token found at this address.
                  </div>
                )}

                <button
                  onClick={handleImportToken}
                  disabled={!metadata}
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:from-stone-400 disabled:to-stone-400"
                >
                  {metadata ? `Import ${metadata.symbol}` : "Import Token"}
                </button>
              </div>
            ) : (
              // --- Token list view ---
              <>
                {/* Search */}
                <div className="border-b border-stone-200 p-3 dark:border-stone-700">
                  <div className="relative">
                    <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search name or paste address"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-stone-400 focus:border-violet-400 focus:bg-white dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:focus:border-violet-500 dark:focus:bg-stone-800"
                    />
                  </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-2">
                  {filteredTokens.length === 0 ? (
                    <div className="py-10 text-center">
                      <p className="text-sm text-stone-500 dark:text-stone-400">No tokens found</p>
                      <button
                        onClick={() => {
                          setShowImport(true);
                          setImportAddress(search);
                        }}
                        className="mt-2 text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
                      >
                        Import &ldquo;{search}&rdquo; as custom token
                      </button>
                    </div>
                  ) : (
                    <motion.div
                      initial="hidden"
                      animate="visible"
                      variants={{
                        visible: { transition: { staggerChildren: 0.015 } },
                      }}
                    >
                      {filteredTokens.map((token) => {
                        const isSelected = selectedToken.address.toLowerCase() === token.address.toLowerCase();
                        const isCustom = (customTokenAddresses ?? new Set<string>()).has(token.address.toLowerCase());
                        return (
                          <motion.div
                            key={token.address}
                            variants={{
                              hidden: { opacity: 0, y: 4 },
                              visible: { opacity: 1, y: 0 },
                            }}
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
                                  <span className="text-sm font-bold text-stone-900 dark:text-stone-100">
                                    {token.symbol}
                                  </span>
                                  {isCustom && (
                                    <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
                                      Custom
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                                    {token.name}
                                  </p>
                                  {!token.isNative && (
                                    <span className="shrink-0 font-mono text-[10px] text-stone-400 dark:text-stone-500">
                                      {truncateAddress(token.address)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {isSelected && (
                                <svg className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              )}
                            </button>
                            {isCustom && onRemoveCustomToken && (
                              <button
                                onClick={() => onRemoveCustomToken(token.address)}
                                className="mr-2 hidden h-7 w-7 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-violet-50 hover:text-violet-500 group-hover:flex dark:hover:bg-violet-950/30"
                                aria-label={`Remove ${token.symbol}`}
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                </svg>
                              </button>
                            )}
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  )}
                </div>

                {/* Footer — Import custom token */}
                {!hideImport && onAddCustomToken && (
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
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
