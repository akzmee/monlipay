"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useAccount } from "wagmi";
import { useBridgeQuote, useBridgeBalance } from "@/hooks/useBridge";
import { monadChain, SUPPORTED_TOKENS } from "@/config/chain";
import { SOURCE_CHAINS, MONAD_DESTINATION_CHAIN_ID } from "@/lib/bridge-client";
import { TokenSelectModal, type ModalToken } from "@/components/TokenSelectModal";
import { TokenAvatar } from "@/components/TokenAvatar";
import { MonadLogo } from "@/components/MonadLogo";
import { chainLogoUri } from "@/lib/chain-logos";
import type { BridgeRoute, BridgeToken, TokenBalance } from "@/lib/bridge-types";

/**
 * Bridge to Monad page.
 *
 * Architecture:
 *   Browser → /api/bridge/quote → LI.FI API (key stays server-side)
 *   Browser → /api/bridge/balance → Alchemy RPC (key stays server-side)
 *   Browser → /api/bridge/tokens → LI.FI tokens (key stays server-side)
 *
 * Safety rails:
 *   - Quote expiry warning (quotes are valid ~30 seconds)
 *   - Slippage display (min received vs expected)
 *   - Fee breakdown transparency (NaN-safe)
 *   - Per-chain token lists (no hardcoded addresses)
 *   - BigInt-safe amount conversion (no float overflow)
 *   - Routes link to LI.FI widget for actual bridging
 */

// Native token sentinel (zero address)
const NATIVE_TOKEN_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

const FALLBACK_TOKENS_ETH: BridgeToken[] = [
  {
    address: NATIVE_TOKEN_ADDRESS,
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    chainId: 1,
    logoURI: chainLogoUri(1),
  },
];

export default function BridgePage() {
  const { address, isConnected } = useAccount();
  const { routes, isLoading: quoteLoading, error: quoteError, fetchQuote } =
    useBridgeQuote();
  const {
    balances,
    isLoading: balanceLoading,
    error: balanceError,
    fetchBalances,
  } = useBridgeBalance();

  // Intent form state
  const [fromChainId, setFromChainId] = useState(1); // Default: Ethereum
  const [fromAmount, setFromAmount] = useState("");
  const [fromTokenAddress, setFromTokenAddress] = useState<string>(
    NATIVE_TOKEN_ADDRESS,
  );
  const [toToken, setToToken] = useState(
    SUPPORTED_TOKENS[0]?.address || NATIVE_TOKEN_ADDRESS,
  );
  const [quoteExpiry, setQuoteExpiry] = useState<number | null>(null);

  // Modal state
  const [showFromTokenModal, setShowFromTokenModal] = useState(false);
  const [showToTokenModal, setShowToTokenModal] = useState(false);
  const [showChainModal, setShowChainModal] = useState(false);

  // Token list state
  const [tokenList, setTokenList] = useState<BridgeToken[]>([]);
  const [tokenListLoading, setTokenListLoading] = useState(false);

  // Fetch tokens for the selected source chain
  useEffect(() => {
    let cancelled = false;
    setTokenListLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/bridge/tokens?chain=${fromChainId}`);
        if (!res.ok) {
          if (!cancelled) setTokenList(FALLBACK_TOKENS_ETH);
          return;
        }
        const data = (await res.json()) as { tokens: BridgeToken[] };
        if (cancelled) return;

        const nativeToken: BridgeToken = {
          address: NATIVE_TOKEN_ADDRESS,
          symbol: NATIVE_SYMBOLS[fromChainId] || "ETH",
          name: NATIVE_NAMES[fromChainId] || "Ether",
          decimals: 18,
          chainId: fromChainId,
          logoURI: chainLogoUri(fromChainId),
        };

        const erc20Tokens = (data.tokens || []).filter(
          (t) => t.address !== NATIVE_TOKEN_ADDRESS,
        );
        setTokenList([nativeToken, ...erc20Tokens].slice(0, 100));
      } catch {
        if (!cancelled) setTokenList(FALLBACK_TOKENS_ETH);
      } finally {
        if (!cancelled) setTokenListLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fromChainId]);

  // Reset token selection when chain changes
  useEffect(() => {
    setFromTokenAddress(NATIVE_TOKEN_ADDRESS);
  }, [fromChainId]);

  // Scan balances when wallet connects
  useEffect(() => {
    if (address) {
      void fetchBalances(address);
    }
  }, [address, fetchBalances]);

  // Quote expiry timer
  useEffect(() => {
    if (!quoteExpiry) return;
    const timer = setInterval(() => {
      if (Date.now() > quoteExpiry) {
        setQuoteExpiry(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [quoteExpiry]);

  // Lookup decimals
  const fromTokenDecimals = useMemo(() => {
    const token = tokenList.find((t) => t.address === fromTokenAddress);
    return token?.decimals ?? 18;
  }, [tokenList, fromTokenAddress]);

  // Currently selected source token (for display)
  const selectedFromToken = useMemo<BridgeToken>(() => {
    return (
      tokenList.find((t) => t.address === fromTokenAddress) ??
      tokenList[0] ?? {
        address: NATIVE_TOKEN_ADDRESS as `0x${string}`,
        symbol: NATIVE_SYMBOLS[fromChainId] || "ETH",
        name: NATIVE_NAMES[fromChainId] || "Ether",
        decimals: 18,
        chainId: fromChainId,
        logoURI: chainLogoUri(fromChainId),
      }
    );
  }, [tokenList, fromTokenAddress, fromChainId]);

  // Selected destination token
  const selectedToToken = useMemo(() => {
    return (
      SUPPORTED_TOKENS.find((t) => t.address === toToken) ?? SUPPORTED_TOKENS[0]
    );
  }, [toToken]);

  // Selected source chain
  const selectedChain = useMemo(
    () => SOURCE_CHAINS.find((c) => c.id === fromChainId) ?? SOURCE_CHAINS[0],
    [fromChainId],
  );

  const handleGetQuote = useCallback(async () => {
    if (!address || !fromAmount) return;

    const amountInSmallest = toSmallestUnits(fromAmount, fromTokenDecimals);
    if (!amountInSmallest) return;

    await fetchQuote({
      fromChain: fromChainId,
      fromToken: fromTokenAddress as `0x${string}`,
      fromAmount: amountInSmallest,
      toChain: MONAD_DESTINATION_CHAIN_ID,
      toToken: toToken as `0x${string}`,
      fromAddress: address,
    });

    setQuoteExpiry(Date.now() + 30_000);
  }, [
    address,
    fromAmount,
    fromTokenAddress,
    fromTokenDecimals,
    fromChainId,
    toToken,
    fetchQuote,
  ]);

  // Tokens for the modal (cast to ModalToken)
  const fromTokenOptions: ModalToken[] = useMemo(
    () =>
      tokenList.map((t) => ({
        symbol: t.symbol,
        name: t.name,
        address: t.address,
        decimals: t.decimals,
        isNative: t.address === NATIVE_TOKEN_ADDRESS,
        logoURI: t.logoURI,
      })),
    [tokenList],
  );

  const toTokenOptions: ModalToken[] = useMemo(
    () =>
      SUPPORTED_TOKENS.map((t) => ({
        symbol: t.symbol,
        name: t.name,
        address: t.address,
        decimals: t.decimals,
        isNative: t.isNative,
        logoURI: t.logoURI,
      })),
    [],
  );

  return (
    <div className="hero-gradient min-h-[calc(100vh-3.5rem)]">
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:py-8 sm:pb-8">
        {/* Hero */}
        <div className="mb-5 text-center sm:mb-6">
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100 sm:text-3xl">
            Bridge to Monad
          </h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Move your assets from any chain to Monad. Get the best bridge route
            automatically.
          </p>
        </div>

        {!isConnected ? (
          <NotConnectedState />
        ) : (
          <div className="space-y-4">
            {/* Intent Form — web3 native */}
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-5">
              {/* Source: Amount + Token */}
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 transition-colors focus-within:border-violet-400 focus-within:bg-white dark:border-stone-700 dark:bg-stone-800/50 dark:focus-within:border-violet-500 dark:focus-within:bg-stone-800">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
                    From
                  </span>
                  {/* Source chain selector — top-right of the From panel.
                      Renders as a compact pill with chain logo + name. */}
                  <button
                    type="button"
                    onClick={() => setShowChainModal(true)}
                    disabled={tokenListLoading}
                    className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-100 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600/50"
                    aria-label={`Source chain: ${selectedChain.name}. Click to change.`}
                  >
                    <ChainAvatar chain={selectedChain} size={16} />
                    <span>{selectedChain.name}</span>
                    <ChevronDownIcon />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={fromAmount}
                    onChange={(e) => setFromAmount(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-2xl font-bold text-stone-900 outline-none placeholder:text-stone-300 dark:text-stone-100 dark:placeholder:text-stone-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFromTokenModal(true)}
                    className="flex shrink-0 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm transition-all hover:shadow-md active:scale-95 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-100"
                  >
                    <TokenAvatar token={selectedFromToken} size={24} />
                    <span>{selectedFromToken.symbol}</span>
                    <ChevronDownIcon />
                  </button>
                </div>
                {tokenListLoading && (
                  <p className="mt-1.5 text-right text-[10px] text-stone-400">
                    Loading tokens…
                  </p>
                )}
              </div>

              {/* Arrow divider */}
              <div className="my-3 flex justify-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 shadow-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l-6-6m6 6l6-6" />
                  </svg>
                </div>
              </div>

              {/* Destination: Monad + Token */}
              <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 dark:border-violet-800/60 dark:bg-violet-950/20">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
                    To
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-300">
                    <MonadLogo variant="mark" size={14} />
                    {monadChain.name}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1 text-2xl font-bold text-stone-900 dark:text-stone-100">
                    {routes[0]
                      ? formatAmount(routes[0].toAmount, routes[0].toToken.decimals)
                      : "0.0"}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowToTokenModal(true)}
                    className="flex shrink-0 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm transition-all hover:shadow-md active:scale-95 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-100"
                  >
                    <TokenAvatar token={selectedToToken} size={24} />
                    <span>{selectedToToken.symbol}</span>
                    <ChevronDownIcon />
                  </button>
                </div>
              </div>

              {/* Get Quote Button */}
              <button
                type="button"
                onClick={handleGetQuote}
                disabled={
                  !fromAmount ||
                  parseFloat(fromAmount) <= 0 ||
                  quoteLoading ||
                  tokenListLoading
                }
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-4 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/40 hover:from-violet-500 hover:to-indigo-500 active:scale-95 disabled:cursor-not-allowed disabled:from-stone-400 disabled:to-stone-400 disabled:shadow-none"
              >
                {quoteLoading ? (
                  <>
                    <SpinnerIcon />
                    Finding routes…
                  </>
                ) : (
                  <>
                    <SearchIcon />
                    Find Bridge Route
                  </>
                )}
              </button>

              {/* Quote expiry */}
              {quoteExpiry && Date.now() < quoteExpiry && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <ClockIcon />
                  Quote expires in {Math.ceil((quoteExpiry - Date.now()) / 1000)}s
                </div>
              )}
            </div>

            {/* Balance scan */}
            {balanceLoading && balances.length === 0 && (
              <div className="rounded-2xl border border-stone-200 bg-white p-4 text-center text-sm text-stone-400 dark:border-stone-800 dark:bg-stone-900">
                Scanning balances…
              </div>
            )}
            {balanceError && <ErrorBanner message={balanceError} />}
            {balances.length > 0 && (
              <BalanceCard
                balances={balances}
                onSelectBalance={(b) => {
                  setFromChainId(b.chainId);
                  setFromTokenAddress(b.token.address);
                  setFromAmount(b.balanceFormatted);
                }}
              />
            )}

            {/* Quote error */}
            {quoteError && <ErrorBanner message={quoteError} />}

            {/* Route results */}
            {routes.length > 0 && (
              <RouteResults
                routes={routes}
                quoteExpired={quoteExpiry !== null && Date.now() > quoteExpiry}
              />
            )}
          </div>
        )}
      </div>

      {/* --- Modals --- */}
      <TokenSelectModal
        open={showFromTokenModal}
        onClose={() => setShowFromTokenModal(false)}
        tokens={fromTokenOptions}
        selectedToken={fromTokenOptions.find(
          (t) => t.address === fromTokenAddress,
        ) ?? fromTokenOptions[0]}
        onSelect={(t) => setFromTokenAddress(t.address)}
        hideImport
      />

      <TokenSelectModal
        open={showToTokenModal}
        onClose={() => setShowToTokenModal(false)}
        tokens={toTokenOptions}
        selectedToken={toTokenOptions.find(
          (t) => t.address === toToken,
        ) ?? toTokenOptions[0]}
        onSelect={(t) => setToToken(t.address as `0x${string}`)}
        hideImport
      />

      <ChainSelectModal
        open={showChainModal}
        onClose={() => setShowChainModal(false)}
        selectedId={fromChainId}
        onSelect={(id) => setFromChainId(id)}
      />
    </div>
  );
}

// --- Constants ---

const NATIVE_SYMBOLS: Record<number, string> = {
  1: "ETH",
  10: "ETH",
  8453: "ETH",
  42161: "ETH",
  137: "MATIC",
  56: "BNB",
  43114: "AVAX",
};

const NATIVE_NAMES: Record<number, string> = {
  1: "Ether",
  10: "Ether (Optimism)",
  8453: "Ether (Base)",
  42161: "Ether (Arbitrum)",
  137: "MATIC",
  56: "BNB",
  43114: "AVAX",
};

// --- Utility Functions ---

function toSmallestUnits(amount: string, decimals: number): string | null {
  if (!amount || amount === ".") return null;
  const trimmed = amount.trim();
  if (!/^\d*\.?\d*$/.test(trimmed)) return null;
  if (trimmed.includes("-")) return null;

  const dotIndex = trimmed.indexOf(".");
  let wholePart: string;
  let fractionPart: string;

  if (dotIndex === -1) {
    wholePart = trimmed;
    fractionPart = "";
  } else {
    wholePart = trimmed.substring(0, dotIndex) || "0";
    fractionPart = trimmed.substring(dotIndex + 1);
  }

  if (fractionPart.length > decimals) {
    fractionPart = fractionPart.substring(0, decimals);
  } else {
    fractionPart = fractionPart.padEnd(decimals, "0");
  }

  try {
    const whole = BigInt(wholePart || "0");
    const fraction = BigInt(fractionPart || "0");
    const divisor = 10n ** BigInt(decimals);
    const result = whole * divisor + fraction;
    if (result <= 0n) return null;
    return result.toString();
  } catch {
    return null;
  }
}

function safeParseUSD(value: string | undefined): number {
  if (!value) return 0;
  const n = parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
}

// --- Sub-components ---

function NotConnectedState() {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-5">
      <div className="flex flex-col items-center gap-3 py-8 text-center sm:py-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950/50">
          <svg className="h-6 w-6 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Connect your wallet</h2>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            Connect to scan your balances and find bridge routes
          </p>
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
      <div className="flex items-start gap-2">
        <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <span>{message}</span>
      </div>
    </div>
  );
}

function BalanceCard({
  balances,
  onSelectBalance,
}: {
  balances: TokenBalance[];
  onSelectBalance: (b: TokenBalance) => void;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Your Balances ({balances.length} tokens found)
      </h3>
      <div className="space-y-1.5">
        {balances.slice(0, 5).map((b) => (
          <button
            key={`${b.chainId}-${b.token.address}`}
            onClick={() => onSelectBalance(b)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <div className="flex items-center gap-2">
              <TokenAvatar token={b.token} size={24} />
              <div>
                <div className="text-sm font-medium text-stone-900 dark:text-stone-100">
                  {b.balanceFormatted} {b.token.symbol}
                </div>
                <div className="text-xs text-stone-500 dark:text-stone-400">
                  {SOURCE_CHAINS.find((c) => c.id === b.chainId)?.name ||
                    `Chain ${b.chainId}`}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function RouteResults({
  routes,
  quoteExpired,
}: {
  routes: BridgeRoute[];
  quoteExpired: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
          Bridge Routes ({routes.length})
        </h3>
        {quoteExpired && (
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            Quote expired — refresh
          </span>
        )}
      </div>

      <AnimatePresence>
        {routes.map((route, i) => (
          <motion.div
            key={route.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.2 }}
          >
            <RouteCard route={route} expired={quoteExpired} />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Safety note */}
      <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs text-stone-500 dark:border-stone-700 dark:bg-stone-800/50 dark:text-stone-400">
        <p className="flex items-start gap-1.5">
          <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Routes are fetched from LI.FI (server-side). Execution is handled by
            the bridge provider directly in your wallet. Always verify the
            recipient address and minimum received before confirming.
          </span>
        </p>
      </div>
    </div>
  );
}

function RouteCard({ route, expired }: { route: BridgeRoute; expired: boolean }) {
  const fromTokenAmount = formatAmount(route.fromAmount, route.fromToken.decimals);
  const toTokenAmount = formatAmount(route.toAmount, route.toToken.decimals);
  const minReceived = formatAmount(route.toAmountMin, route.toToken.decimals);
  const durationMin = Math.max(1, Math.ceil(route.executionDuration / 60));

  const gasCost = safeParseUSD(route.gasCostUSD);
  const bridgeFee = safeParseUSD(route.fees.bridgeFeeUSD);
  const totalFeeUSD = gasCost + bridgeFee;

  const toAmountBig = safeBigInt(route.toAmount);
  const toAmountMinBig = safeBigInt(route.toAmountMin);
  let slippagePct = 0;
  if (toAmountBig > 0n && toAmountMinBig < toAmountBig) {
    const scaled = ((toAmountBig - toAmountMinBig) * 10000n) / toAmountBig;
    slippagePct = Number(scaled) / 100;
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={route.toolDetails.logoURI}
            alt={route.toolDetails.name}
            className="h-8 w-8 rounded-lg"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <div>
            <div className="text-sm font-bold text-stone-900 dark:text-stone-100">
              {route.toolDetails.name}
            </div>
            <div className="text-xs text-stone-500 dark:text-stone-400">
              {route.steps} step{route.steps > 1 ? "s" : ""} · ~{durationMin} min
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-stone-900 dark:text-stone-100">
            {toTokenAmount}
          </div>
          <div className="text-xs text-stone-500 dark:text-stone-400">{route.toToken.symbol}</div>
        </div>
      </div>

      {/* Route flow */}
      <div className="mb-3 flex items-center justify-center gap-3 rounded-xl bg-stone-50 py-3 dark:bg-stone-800/50">
        <div className="text-center">
          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">{fromTokenAmount}</div>
          <div className="text-xs text-stone-500 dark:text-stone-400">{route.fromToken.symbol}</div>
        </div>
        <svg className="h-4 w-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
        <div className="text-center">
          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">{toTokenAmount}</div>
          <div className="text-xs text-stone-500 dark:text-stone-400">{route.toToken.symbol}</div>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Detail label="Min. Received" value={`${minReceived} ${route.toToken.symbol}`} />
        <Detail label="Total Fee" value={`$${totalFeeUSD.toFixed(2)}`} />
        <Detail label="Bridge Fee" value={`$${bridgeFee.toFixed(2)}`} />
        <Detail label="Est. Gas" value={`$${gasCost.toFixed(2)}`} />
      </div>

      {/* Slippage warning */}
      {slippagePct >= 5 && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          High slippage: minimum received is {(100 - slippagePct).toFixed(1)}% of expected
        </div>
      )}

      {/* CTA */}
      <a
        href={`https://li.fi/bridge?fromChain=${route.fromToken.chainId}&fromToken=${route.fromToken.address}&fromAmount=${route.fromAmount}&toChain=${route.toToken.chainId}&toToken=${route.toToken.address}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all ${
          expired
            ? "cursor-not-allowed bg-stone-400"
            : "bg-gradient-to-r from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/40 hover:from-violet-500 hover:to-indigo-500"
        }`}
        aria-disabled={expired}
      >
        {expired ? "Quote Expired" : "Bridge via LI.FI Widget"}
        {!expired && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        )}
      </a>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-stone-500 dark:text-stone-400">{label}</span>
      <span className="font-medium text-stone-900 dark:text-stone-100">{value}</span>
    </div>
  );
}

// --- Chain selector modal (replaces <select>) ---

function ChainSelectModal({
  open,
  onClose,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  selectedId: number;
  onSelect: (id: number) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-md sm:items-center"
          style={{
            // Respect mobile browser chrome (home indicator on iOS,
            // address bar on Android). See NetworkSwitcherModal.tsx.
            paddingTop: "max(env(safe-area-inset-top), 0px)",
            paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
          }}
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="flex max-h-[70dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: "100%", opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3.5 dark:border-stone-700">
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Select source chain
              </h2>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {SOURCE_CHAINS.map((chain) => {
                const isSelected = chain.id === selectedId;
                return (
                  <button
                    key={chain.id}
                    onClick={() => {
                      onSelect(chain.id);
                      onClose();
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                      isSelected
                        ? "bg-violet-50 dark:bg-violet-950/30"
                        : "hover:bg-stone-100 dark:hover:bg-stone-800"
                    }`}
                  >
                    <ChainAvatar chain={chain} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-stone-900 dark:text-stone-100">
                        {chain.name}
                      </div>
                      <div className="font-mono text-[10px] text-stone-400 dark:text-stone-500">
                        Chain ID: {chain.id}
                      </div>
                    </div>
                    {isSelected && (
                      <svg className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// --- Shared mini-components ---

function ChevronDownIcon() {
  return (
    <svg className="h-4 w-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

function ChainAvatar({
  chain,
  size = 24,
}: {
  chain: { id: number; name: string; shortName: string; logoURI?: string };
  size?: number;
}) {
  const [imgError, setImgError] = useState(false);
  if (chain.logoURI && !imgError) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={chain.logoURI}
        alt={chain.name}
        className="rounded-full"
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {chain.shortName.charAt(0).toUpperCase()}
    </div>
  );
}

// --- Icons ---

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// --- Utils ---

function formatAmount(amount: string, decimals: number): string {
  try {
    const big = BigInt(amount);
    const divisor = 10n ** BigInt(decimals);
    const whole = big / divisor;
    const fraction = big % divisor;
    const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 4);
    return `${whole.toString()}.${fractionStr}`;
  } catch {
    return "0";
  }
}

function safeBigInt(value: string | undefined): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}
