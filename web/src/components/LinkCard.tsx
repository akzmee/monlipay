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
  onRefund,
}: LinkCardProps) {
  const tokenSymbol = token === "0x0000000000000000000000000000000000000000" ? "MON" : "TOKEN";

  const status: { label: string; color: string } = isClaimed
    ? { label: "Claimed", color: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" }
    : isExpired
      ? { label: "Expired — refundable", color: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" }
      : { label: "Active", color: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300" };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between gap-4">
        {/* Left: amount and ID */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">
              {amount} {tokenSymbol}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}>
              {status.label}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500">
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
        </div>

        {/* Right: action */}
        <div className="shrink-0">
          {canRefund && (
            <button
              onClick={onRefund}
              disabled={isBusy}
              className="flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-40 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/60"
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
