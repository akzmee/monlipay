"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAccount } from "wagmi";
import { useBridgeQuote, useBridgeBalance } from "@/hooks/useBridge";
import { monadChain, SUPPORTED_TOKENS } from "@/config/chain";
import { SOURCE_CHAINS, MONAD_DESTINATION_CHAIN_ID } from "@/lib/bridge-client";
import type { BridgeRoute, BridgeToken, TokenBalance } from "@/lib/bridge-types";

/**
 * Bridge to Monad page.
 *
 * Lets users state an intent ("I want X USDC on Monad") and find bridge routes
 * from supported source chains (Ethereum, Arbitrum, Base, Optimism, etc).
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
 *
 * Fixes applied:
 *   - C1: Token addresses fetched per-chain from /api/bridge/tokens
 *   - C2: Decimals read from token metadata, not hardcoded
 *   - C3: Amount conversion uses BigInt, not parseFloat × 10**decimals
 *   - H6: useBridgeStatus removed (was imported but never used)
 *   - H7: isContractDeployed removed (was imported but never used)
 */

// Native token sentinel (zero address)
const NATIVE_TOKEN_ADDRESS =
  "0x0000000000000000000000000000000000000000" as const;

// Common tokens to show if LI.FI token list fails to load.
// These are MAINNET ETHEREUM addresses only — used as a last-resort fallback
// on the Ethereum chain dropdown. Per-chain addresses come from /api/bridge/tokens.
const FALLBACK_TOKENS_ETH: BridgeToken[] = [
  {
    address: NATIVE_TOKEN_ADDRESS,
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    chainId: 1,
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

  // Token list state (C1 fix: fetched per-chain, not hardcoded)
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

        // Always include native token at the top
        const nativeToken: BridgeToken = {
          address: NATIVE_TOKEN_ADDRESS,
          symbol: NATIVE_SYMBOLS[fromChainId] || "ETH",
          name: NATIVE_NAMES[fromChainId] || "Ether",
          decimals: 18,
          chainId: fromChainId,
        };

        // Filter out the zero-address from LI.FI response (if any), then prepend native
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

  // Check quote expiry
  useEffect(() => {
    if (!quoteExpiry) return;
    const timer = setInterval(() => {
      if (Date.now() > quoteExpiry) {
        setQuoteExpiry(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [quoteExpiry]);

  // Lookup decimals for the currently selected source token (C2 fix)
  const fromTokenDecimals = useMemo(() => {
    const token = tokenList.find((t) => t.address === fromTokenAddress);
    return token?.decimals ?? 18;
  }, [tokenList, fromTokenAddress]);

  const handleGetQuote = useCallback(async () => {
    if (!address || !fromAmount) return;

    // C3 fix: Use BigInt for amount conversion to avoid float precision loss.
    // parseFloat("123456789.123456789") * 10**18 loses precision.
    // We split on ".", parse whole and fraction separately with BigInt.
    const amountInSmallest = toSmallestUnits(
      fromAmount,
      fromTokenDecimals,
    );
    if (!amountInSmallest) return;

    await fetchQuote({
      fromChain: fromChainId,
      fromToken: fromTokenAddress as `0x${string}`,
      fromAmount: amountInSmallest,
      toChain: MONAD_DESTINATION_CHAIN_ID,
      toToken: toToken as `0x${string}`,
      fromAddress: address,
    });

    // Quotes expire after 30 seconds
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

  return (
    <div className="hero-gradient min-h-[calc(100vh-3.5rem)]">
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:py-8 sm:pb-8">
        {/* Hero */}
        <div className="mb-5 text-center sm:mb-6">
          <h1 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">
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
            {/* Intent Form */}
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-stone-900 dark:text-stone-100">
                I want to bridge
              </h2>

              {/* Amount + Token */}
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-800/50">
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs font-medium text-stone-500 dark:text-stone-400">
                    Amount
                  </label>
                  {tokenListLoading && (
                    <span className="text-xs text-stone-400">Loading tokens...</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={fromAmount}
                    onChange={(e) => setFromAmount(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-2xl font-bold outline-none placeholder:text-stone-400 dark:text-stone-100"
                  />
                  <select
                    value={fromTokenAddress}
                    onChange={(e) => setFromTokenAddress(e.target.value)}
                    className="max-w-[140px] rounded-xl bg-white px-3 py-2 text-sm font-bold shadow-sm dark:bg-stone-700 dark:text-stone-100"
                  >
                    {tokenList.length === 0 ? (
                      <option value={NATIVE_TOKEN_ADDRESS}>
                        {NATIVE_SYMBOLS[fromChainId] || "ETH"}
                      </option>
                    ) : (
                      tokenList.map((token) => (
                        <option key={token.address} value={token.address}>
                          {token.symbol}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                {fromTokenDecimals !== 18 && (
                  <p className="mt-1 text-xs text-stone-400">
                    {fromTokenDecimals} decimals
                  </p>
                )}
              </div>

              {/* Source Chain */}
              <div className="mt-3">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-500">
                  From Chain
                </label>
                <select
                  value={fromChainId}
                  onChange={(e) => setFromChainId(parseInt(e.target.value, 10))}
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-violet-400 dark:border-stone-700 dark:bg-stone-800 dark:focus:border-violet-500"
                >
                  {SOURCE_CHAINS.map((chain) => (
                    <option key={chain.id} value={chain.id}>
                      {chain.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Destination */}
              <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 dark:border-violet-900 dark:bg-violet-950/30">
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-violet-400 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-violet-500" />
                  </span>
                  <span className="text-sm font-medium text-violet-700 dark:text-violet-300">
                    To: {monadChain.name} (Chain #{MONAD_DESTINATION_CHAIN_ID})
                  </span>
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
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/40 disabled:cursor-not-allowed disabled:from-stone-400 disabled:to-stone-400 disabled:shadow-none"
              >
                {quoteLoading ? (
                  <>
                    <SpinnerIcon />
                    Finding routes...
                  </>
                ) : (
                  <>
                    <SearchIcon />
                    Find Bridge Route
                  </>
                )}
              </button>

              {/* Quote expiry warning */}
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
                Scanning balances...
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

/**
 * Convert a human-readable amount string to smallest units using BigInt.
 *
 * C3 fix: This avoids parseFloat precision loss. For example:
 *   toSmallestUnits("0.1", 18) → "100000000000000000" (correct)
 *   parseFloat("0.1") * 10**18 → 100000000000000012.5 (WRONG — float error)
 *
 * Returns null if the input is invalid.
 */
function toSmallestUnits(amount: string, decimals: number): string | null {
  if (!amount || amount === ".") return null;
  const trimmed = amount.trim();
  if (!/^\d*\.?\d*$/.test(trimmed)) return null;

  const negativeIndex = trimmed.indexOf("-");
  if (negativeIndex !== -1) return null;

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

  // Pad or truncate fraction to the token's decimals
  if (fractionPart.length > decimals) {
    // Truncate extra precision (don't round — user entered too many digits)
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

/**
 * Parse a USD cost string safely, returning 0 if invalid.
 * Prevents NaN from appearing in the UI.
 */
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
          <svg
            className="h-6 w-6 text-violet-600 dark:text-violet-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Connect your wallet</h2>
          <p className="mt-1 text-xs text-stone-500">
            Connect to scan your balances and find bridge routes
          </p>
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
      <div className="flex items-start gap-2">
        <svg
          className="mt-0.5 h-4 w-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
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
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
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
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 text-xs font-bold text-white">
                {b.token.symbol.charAt(0)}
              </span>
              <div>
                <div className="text-sm font-medium text-stone-900 dark:text-stone-100">
                  {b.balanceFormatted} {b.token.symbol}
                </div>
                <div className="text-xs text-stone-500">
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

      {routes.map((route) => (
        <RouteCard key={route.id} route={route} expired={quoteExpired} />
      ))}

      {/* Safety note */}
      <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-500 dark:border-stone-700 dark:bg-stone-800/50">
        <p className="flex items-start gap-1.5">
          <svg
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
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

  // NaN-safe fee parsing (fixes M7/M8)
  const gasCost = safeParseUSD(route.gasCostUSD);
  const bridgeFee = safeParseUSD(route.fees.bridgeFeeUSD);
  const totalFeeUSD = gasCost + bridgeFee;

  // Slippage calculation using BigInt for precision
  const toAmountBig = safeBigInt(route.toAmount);
  const toAmountMinBig = safeBigInt(route.toAmountMin);
  let slippagePct = 0;
  if (toAmountBig > 0n && toAmountMinBig < toAmountBig) {
    // (1 - min/expected) * 100, using BigInt scaled by 10000 for 2 decimal places
    const scaled = (toAmountBig - toAmountMinBig) * 10000n / toAmountBig;
    slippagePct = Number(scaled) / 100;
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      {/* Header: Bridge provider */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-xs font-bold text-white">
            {route.toolDetails.name.charAt(0)}
          </div>
          <div>
            <div className="text-sm font-bold text-stone-900 dark:text-stone-100">
              {route.toolDetails.name}
            </div>
            <div className="text-xs text-stone-500">
              {route.steps} step{route.steps > 1 ? "s" : ""} · ~{durationMin}{" "}
              min
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-stone-900 dark:text-stone-100">
            {toTokenAmount}
          </div>
          <div className="text-xs text-stone-500">{route.toToken.symbol}</div>
        </div>
      </div>

      {/* Route flow */}
      <div className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-stone-50 py-2 dark:bg-stone-800/50">
        <div className="text-center">
          <div className="text-sm font-medium">{fromTokenAmount}</div>
          <div className="text-xs text-stone-500">{route.fromToken.symbol}</div>
        </div>
        <svg
          className="h-4 w-4 text-stone-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
          />
        </svg>
        <div className="text-center">
          <div className="text-sm font-medium">{toTokenAmount}</div>
          <div className="text-xs text-stone-500">{route.toToken.symbol}</div>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Detail
          label="Min. Received"
          value={`${minReceived} ${route.toToken.symbol}`}
        />
        <Detail label="Total Fee" value={`$${totalFeeUSD.toFixed(2)}`} />
        <Detail
          label="Bridge Fee"
          value={`$${bridgeFee.toFixed(2)}`}
        />
        <Detail label="Est. Gas" value={`$${gasCost.toFixed(2)}`} />
      </div>

      {/* Slippage warning — only show if meaningful */}
      {slippagePct >= 5 && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          High slippage: minimum received is {(100 - slippagePct).toFixed(1)}% of
          expected
        </div>
      )}

      {/* Action: redirect to LI.FI for execution */}
      <a
        href={`https://li.fi/bridge?fromChain=${route.fromToken.chainId}&fromToken=${route.fromToken.address}&fromAmount=${route.fromAmount}&toChain=${route.toToken.chainId}&toToken=${route.toToken.address}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all ${
          expired
            ? "cursor-not-allowed bg-stone-400"
            : "bg-gradient-to-r from-violet-600 to-purple-600 hover:shadow-lg hover:shadow-violet-500/25"
        }`}
        aria-disabled={expired}
      >
        {expired ? "Quote Expired" : "Bridge via LI.FI Widget"}
        {!expired && (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
            />
          </svg>
        )}
      </a>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-stone-500">{label}</span>
      <span className="font-medium text-stone-900 dark:text-stone-100">
        {value}
      </span>
    </div>
  );
}

// --- Icons ---

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

// --- Utils ---

/** Format a smallest-units amount to human-readable, using BigInt. */
function formatAmount(amount: string, decimals: number): string {
  try {
    const big = BigInt(amount);
    const divisor = 10n ** BigInt(decimals);
    const whole = big / divisor;
    const fraction = big % divisor;
    const fractionStr = fraction
      .toString()
      .padStart(decimals, "0")
      .slice(0, 4);
    return `${whole.toString()}.${fractionStr}`;
  } catch {
    return "0";
  }
}

/** Parse a string to BigInt, returning 0n on failure. */
function safeBigInt(value: string | undefined): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}
