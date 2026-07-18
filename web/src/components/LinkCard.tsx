"use client";

import { useState, useEffect } from "react";

interface LinkCardProps {
  depositId: string;
  amount: string;
  token: string;
  expiry: number;
  isClaimed: boolean;
  isExpired: boolean;
  canRefund: boolean;
  isBusy: boolean;
  /**
   * HIGH-5: True when this link failed during the autoRefund batch (e.g.
   * race with another caller, or the wallet rejected the tx). Surfaces
   * a per-link warning so the user knows which link needs manual action.
   */
  autoRefundFailed?: boolean;
  /**
   * Full claim URL (with #fragment) for the user to re-copy and reshare.
   * Only present for links created after the storage fix (commit d37890f).
   * Older links created before that fix have no recoverable secret key —
   * the shareableUrl was lost. In those cases we show a muted hint.
   */
  shareableUrl?: string;
  onRefund: () => void;
}

export function LinkCard({
  depositId,
  amount,
  token,
  expiry,
  isClaimed,
  isExpired,
  canRefund,
  isBusy,
  autoRefundFailed = false,
  shareableUrl,
  onRefund,
}: LinkCardProps) {
  const tokenSymbol = token === "0x0000000000000000000000000000000000000000" ? "MON" : "TOKEN";
  const [copied, setCopied] = useState(false);

  const status: { label: string; color: string } = isClaimed
    ? { label: "Claimed", color: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400" }
    : isExpired
      ? { label: "Expired — refundable", color: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" }
      : { label: "Active", color: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300" };

  const canShare = !isClaimed && shareableUrl;

  const handleCopy = async () => {
    if (!shareableUrl) return;
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // clipboard API may be unavailable (insecure context) — no-op
    }
  };

  return (
    <div className={`rounded-xl border p-4 transition-shadow hover:shadow-sm dark:bg-stone-900 ${
      autoRefundFailed
        ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20"
        : "border-stone-200 bg-white dark:border-stone-800"
    }`}>
      <div className="flex items-center justify-between gap-4">
        {/* Left: amount and ID */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">
              {amount} {tokenSymbol}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>
              {status.label}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-stone-500">
            <span className="font-mono">#{depositId}</span>
            {!isClaimed && !isExpired && (
              <span className="flex items-center gap-1">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <RelativeExpiry expiry={expiry} />
              </span>
            )}
          </div>
          {autoRefundFailed && (
            <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
              ⚠ Auto-refund skipped for this link — try a manual refund below.
            </p>
          )}

          {/* Shareable URL row — for re-copying if the user forgot the link */}
          {canShare && (
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-stone-100 px-2 py-1.5 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-400">
                {shareableUrl}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="flex shrink-0 items-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/60"
                title="Copy link"
              >
                {copied ? (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.625c0-.621-.504-1.125-1.125-1.125H11.625a1.125 1.125 0 0 0-1.125 1.125v3.375a9.06 9.06 0 0 1-.124 1.5m7.5-10.376V3.375c0-.621-.504-1.125-1.125-1.125H11.625a1.125 1.125 0 0 0-1.125 1.125v3.375c0 .621.504 1.125 1.125 1.125h3.375c.621 0 1.125-.504 1.125-1.125Z" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
          )}
          {!shareableUrl && !isClaimed && (
            <p className="mt-2 text-xs italic text-stone-400 dark:text-stone-500">
              Link URL not saved — created before the storage fix. Wait for expiry to refund.
            </p>
          )}
        </div>

        {/* Right: action */}
        <div className="shrink-0">
          {canRefund && (
            <button
              onClick={onRefund}
              disabled={isBusy}
              className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-40 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
            >
              {isBusy ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Refunding...
                </>
              ) : (
                "Refund"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RelativeExpiry({ expiry }: { expiry: number }) {
  const [remaining, setRemaining] = useState(expiry - Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(expiry - Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [expiry]);

  if (remaining <= 0) return <span className="text-red-500">Expired</span>;

  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);

  if (days > 0) return <span>Expires in {days}d {hours}h</span>;
  const minutes = Math.floor((remaining % 3600) / 60);
  return <span>Expires in {hours}h {minutes}m</span>;
}
