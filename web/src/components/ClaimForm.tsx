"use client";

import { useState, useEffect } from "react";
import { type Address } from "viem";
import { isGasSponsorAvailable } from "@/config/gas-sponsor";

interface ClaimFormProps {
  isConnected: boolean;
  isBusy: boolean;
  isWrongChain: boolean;
  error: string | null;
  address: Address | undefined;
  recipientOverride: string;
  setRecipientOverride: (v: string) => void;
  recipientError: string | null;
  onClaim: () => void;
}

/**
 * Truncate an Ethereum address: 0x1234…abcd
 */
function truncateAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ClaimForm({
  isConnected,
  isBusy,
  isWrongChain,
  error,
  address,
  recipientOverride,
  setRecipientOverride,
  recipientError,
  onClaim,
}: ClaimFormProps) {
  const canClaim = isConnected && !isWrongChain && !isBusy && !recipientError;
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);

  // If the user edits the recipient after the confirm modal opens, close it
  // — they should re-read the new address before confirming again.
  useEffect(() => {
    setShowOverrideConfirm(false);
  }, [recipientOverride]);

  const handleClickClaim = () => {
    // SECURITY: When the user overrides the recipient to a different address,
    // require an explicit confirmation modal. This prevents phishing scenarios
    // where a victim is given a tampered claim URL with an attacker's address
    // pre-filled. The modal forces the user to acknowledge they are sending
    // funds to a non-default address.
    const trimmed = recipientOverride.trim();
    const hasOverride = trimmed.length > 0 && trimmed.toLowerCase() !== address?.toLowerCase();
    if (hasOverride) {
      setShowOverrideConfirm(true);
      return;
    }
    onClaim();
  };

  // Close on Escape
  useEffect(() => {
    if (!showOverrideConfirm) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowOverrideConfirm(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showOverrideConfirm]);

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center dark:border-stone-800 dark:bg-stone-900">
        <div className="mb-3 flex h-12 w-12 mx-auto items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950/50">
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
              d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"
            />
          </svg>
        </div>
        <h3 className="text-sm font-semibold">Connect wallet to claim</h3>
        <p className="mt-1 text-xs text-stone-500">
          Click <strong>Connect Wallet</strong> at the top right to receive your funds.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Recipient display */}
      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-500">
          Receiving wallet
        </label>
        {address && !recipientOverride && (
          <div className="font-mono text-sm break-all">
            {address}
          </div>
        )}
        <input
          type="text"
          placeholder="Or enter a different address..."
          value={recipientOverride}
          onChange={(e) => setRecipientOverride(e.target.value)}
          disabled={isBusy}
          className={`mt-2 w-full rounded-lg border bg-stone-50 px-3 py-2 text-sm outline-none focus:border-violet-400 dark:bg-stone-800 dark:focus:border-violet-500 ${
            recipientError
              ? "border-red-400 dark:border-red-500"
              : "border-stone-200 dark:border-stone-700"
          }`}
        />
        {recipientError && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{recipientError}</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Gas sponsor badge (visible only when sponsor is configured) */}
      {isGasSponsorAvailable && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          <span>
            <strong>Gasless claim</strong> — gas fee sponsored by MonliPay.
          </span>
        </div>
      )}

      {/* Claim button */}
      <button
        type="button"
        onClick={handleClickClaim}
        disabled={!canClaim}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-indigo-500 active:from-violet-700 active:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isBusy ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Claiming...
          </>
        ) : (
          "Claim Funds"
        )}
      </button>

      <p className="text-center text-xs text-stone-400">
        {isGasSponsorAvailable
          ? "No MON needed — the sponsor covers the gas fee."
          : "Claiming requires a small gas fee in MON for the transaction."}
      </p>

      {/* Recipient override confirmation modal.
          SECURITY: This modal exists to make sure the user actively confirms
          that funds will go to the address they typed, not the connected
          wallet. Closes on Escape and on recipient edit. */}
      {showOverrideConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md"
          style={{
            // Respect mobile browser chrome (address bar, notch, home
            // indicator). See NetworkSwitcherModal.tsx for full rationale.
            paddingTop: "max(env(safe-area-inset-top), 1rem)",
            paddingBottom: "max(env(safe-area-inset-bottom), 1rem)",
            paddingLeft: "max(env(safe-area-inset-left), 1rem)",
            paddingRight: "max(env(safe-area-inset-right), 1rem)",
          }}
          onClick={() => setShowOverrideConfirm(false)}
        >
          <div
            className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-700 dark:bg-stone-900"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="override-title"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/50">
              <svg
                className="h-6 w-6 text-amber-600 dark:text-amber-400"
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
            <h3
              id="override-title"
              className="text-lg font-bold text-stone-900 dark:text-stone-100"
            >
              Send to a different address?
            </h3>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              You are about to claim these funds to a wallet that is not the
              one you are currently connected with. Please verify the address
              carefully — funds sent to the wrong address cannot be recovered.
            </p>
            <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-800">
              <div className="text-xs uppercase tracking-wide text-stone-500">
                Recipient
              </div>
              <div className="mt-1 break-all font-mono text-sm">
                {recipientOverride.trim()}
              </div>
              <div className="mt-2 text-xs text-stone-400">
                Shorthand: {truncateAddress(recipientOverride.trim())}
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowOverrideConfirm(false)}
                disabled={isBusy}
                className="flex-1 rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOverrideConfirm(false);
                  onClaim();
                }}
                disabled={isBusy}
                className="flex-1 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-indigo-500"
              >
                Confirm & Claim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
