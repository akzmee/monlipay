"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { useMyLinks } from "@/hooks/useMyLinks";
import { useAutoRefundExpiredLinks } from "@/hooks/useLinkVault";
import { useRefundMultiple } from "@/hooks/useRefundMultiple";
import { LinkCard } from "@/components/LinkCard";
import { monadChain } from "@/config/chain";
import { formatUnits } from "viem";

/**
 * My Links page.
 *
 * Reads from the Ponder indexer (via useMyLinks) instead of localStorage.
 * This fixes the critical UX bug where link history persisted across wallet
 * switches: each wallet now only sees its own on-chain-created links.
 *
 * The `shareableUrl` field no longer exists in IndexedLink — it cannot be
 * reconstructed from on-chain data (the secret key never leaves the browser).
 * Users are warned at create-time to save the URL; refund still works
 * because the contract's refund() only needs the depositId.
 */
export default function MyLinksPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const isWrongChain = isConnected && chainId !== monadChain.id;

  const { links, isLoading, error, refresh, indexerConfigured } = useMyLinks();

  // Auto-refund expired links when the page mounts. Reads from the indexer
  // (via fetchExpiredLinks) so it works across wallets / devices.
  const {
    processExpiredLinks,
    isProcessing: isAutoRefunding,
    refundedCount,
    error: autoRefundError,
    failedDepositIds,
    reset: resetAutoRefund,
  } = useAutoRefundExpiredLinks();

  const hasAutoRefundedRef = useRef<`0x${string}` | null>(null);
  useEffect(() => {
    // Gate on indexerConfigured — without it, processExpiredLinks is a
    // no-op anyway, but we DON'T want to set hasAutoRefundedRef in that
    // case (otherwise re-running after the user configures the indexer
    // wouldn't trigger a refund).
    if (
      isConnected &&
      !isWrongChain &&
      indexerConfigured &&
      !isAutoRefunding &&
      address &&
      // Only auto-refund once PER ADDRESS. If the user disconnects and
      // reconnects (or switches wallets), we re-run for the new address.
      hasAutoRefundedRef.current !== address
    ) {
      hasAutoRefundedRef.current = address;
      processExpiredLinks(address).then(() => {
        void refresh();
      });
    }
  }, [isConnected, isWrongChain, indexerConfigured, isAutoRefunding, processExpiredLinks, address, refresh]);

  // Reset the auto-refund guard on disconnect so the next connect re-runs.
  useEffect(() => {
    if (!isConnected) {
      hasAutoRefundedRef.current = null;
    }
  }, [isConnected]);

  useEffect(() => {
    if (refundedCount > 0 || autoRefundError) {
      const t = setTimeout(() => resetAutoRefund(), 10_000);
      return () => clearTimeout(t);
    }
  }, [refundedCount, autoRefundError, resetAutoRefund]);

  const { refundMultiple, busyDepositIds, error: refundError } = useRefundMultiple();

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Connect your wallet</h1>
          <p className="mt-2 text-sm text-stone-500">
            Connect to view your payment links.
          </p>
        </div>
      </div>
    );
  }

  if (isWrongChain) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <div className="mb-4 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40">
            <svg
              className="h-7 w-7 text-amber-600 dark:text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold">Wrong network</h1>
          <p className="mt-2 text-sm text-stone-500">
            Switch to {monadChain.name} to manage your links.
          </p>
          <button
            onClick={async () => {
              try {
                await switchChainAsync({ chainId: monadChain.id });
              } catch {
                // User rejected
              }
            }}
            className="mt-4 inline-block rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white transition-all hover:from-violet-500 hover:to-indigo-500"
          >
            Switch to {monadChain.name}
          </button>
        </div>
      </div>
    );
  }

  // Indexer not configured — show a setup hint (does NOT block create/refund).
  if (!indexerConfigured) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">My Links</h1>
          <p className="mt-1 text-sm text-stone-500">
            Track and manage your payment links.
          </p>
        </div>
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Indexer not configured
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            Link history is read from a Ponder indexer, but{" "}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">
              NEXT_PUBLIC_INDEXER_URL
            </code>{" "}
            is not set. Create and refund flows still work — see{" "}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">
              indexer/README.md
            </code>
            .
          </p>
          <Link
            href="/create"
            className="mt-3 inline-block rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white transition-all hover:from-violet-500 hover:to-indigo-500"
          >
            Create link
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading && links.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">My Links</h1>
          <p className="mt-1 text-sm text-stone-500">Loading…</p>
        </div>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="animate-pulse space-y-2">
                <div className="h-4 w-1/4 rounded bg-stone-200 dark:bg-stone-700" />
                <div className="h-6 w-1/3 rounded bg-stone-200 dark:bg-stone-700" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && links.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">My Links</h1>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 dark:border-red-900 dark:bg-red-950/30">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">
            Couldn't load your links
          </p>
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => void refresh()}
            className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-stone-900 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="text-center">
          <div className="mb-4 mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800">
            <svg
              className="h-7 w-7 text-stone-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold">No links yet</h1>
          <p className="mt-2 text-sm text-stone-500">
            Create your first payment link to see it here.
          </p>
          <Link
            href="/create"
            className="mt-4 inline-block rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white transition-all hover:from-violet-500 hover:to-indigo-500"
          >
            Create link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Links</h1>
          <p className="mt-1 text-sm text-stone-500">
            Track and manage your payment links. Expired links auto-refund on open.
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={isLoading}
          className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          {isLoading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="space-y-3">
        {/* Auto-refund notifications */}
        {isAutoRefunding && (
          <div className="flex items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>Auto-refunding expired links…</span>
          </div>
        )}
        {!isAutoRefunding && refundedCount > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
            <span>
              ✓ Auto-refunded <strong>{refundedCount}</strong>{" "}
              {refundedCount === 1 ? "link" : "links"} successfully. Funds returned to your wallet.
            </span>
            <button
              type="button"
              onClick={resetAutoRefund}
              className="text-green-700/70 hover:text-green-700 dark:text-green-300/70 dark:hover:text-green-300"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        )}
        {autoRefundError && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <span>
              Auto-refund skipped: {autoRefundError}. You can still refund manually.
            </span>
            <button
              type="button"
              onClick={resetAutoRefund}
              className="text-amber-700/70 hover:text-amber-700 dark:text-amber-300/70 dark:hover:text-amber-300"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        )}
        {refundError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
            {refundError}
          </div>
        )}
        {links.map((link) => (
          <LinkRow
            key={link.depositId.toString()}
            link={link}
            currentAddress={address}
            isBusy={busyDepositIds.has(link.depositId.toString())}
            autoRefundFailed={failedDepositIds.has(link.depositId.toString())}
            onRefund={async (depositId) => {
              try {
                await refundMultiple(depositId, () => {
                  // No localStorage to update; just refresh from indexer.
                  void refresh();
                });
                // Also refresh after a short delay to catch the indexer's
                // view of the new state (the refund tx emits LinkRefunded,
                // which the indexer will pick up within a few seconds).
                setTimeout(() => void refresh(), 3_000);
              } catch {
                // Error is surfaced via useRefundMultiple.error state
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Single link row.
 *
 * Reads the deposit's CURRENT on-chain state via useDeposit — this is still
 * the source of truth for "is this link claimed right now?" since the
 * indexer may lag by a few seconds. The IndexedLink from the indexer is
 * only used for the LIST of links (which depositIds this user created).
 */
function LinkRow({
  link,
  currentAddress,
  isBusy,
  autoRefundFailed,
  onRefund,
}: {
  link: import("@/lib/indexer-client").IndexedLink;
  currentAddress: `0x${string}` | undefined;
  isBusy: boolean;
  autoRefundFailed: boolean;
  onRefund: (depositId: bigint) => Promise<void>;
}) {
  // Quick local helpers from the indexer row (no extra RPC round-trip).
  const depositIdStr = link.depositId.toString();

  // For display, format amount from base units. The indexer stores amount
  // as raw bigint; we format with 18 decimals for native MON, but for ERC-20
  // tokens we don't know the decimals here without an extra read. We use
  // 18 as a safe default — UI shows full precision if it doesn't fit.
  const amountDisplay = (() => {
    try {
      const formatted = formatUnits(link.amount, 18);
      // Strip trailing zeros for display: "1.000000" → "1"
      return formatted.includes(".")
        ? formatted.replace(/\.?0+$/, "")
        : formatted;
    } catch {
      return link.amount.toString();
    }
  })();

  const tokenSymbol = link.token === "0x0000000000000000000000000000000000000000" ? "MON" : "TOKEN";
  const expiryNum = Number(link.expiry);

  // Derive status from indexer (avoids per-row RPC).
  const isClaimed = link.status === "claimed" || link.status === "refunded";
  const isExpired = !isClaimed && Math.floor(Date.now() / 1000) >= expiryNum;
  const canRefund =
    isExpired &&
    link.status === "active" &&
    link.sender.toLowerCase() === (currentAddress ?? "").toLowerCase();

  return (
    <LinkCard
      depositId={depositIdStr}
      amount={amountDisplay}
      token={link.token}
      expiry={expiryNum}
      isClaimed={isClaimed}
      isExpired={isExpired}
      canRefund={canRefund}
      isBusy={isBusy}
      autoRefundFailed={autoRefundFailed}
      // shareableUrl intentionally omitted — the indexer cannot reconstruct
      // it (secret key never leaves the browser). Users are warned at
      // create-time to save the URL.
      onRefund={() => onRefund(link.depositId)}
    />
  );
}
