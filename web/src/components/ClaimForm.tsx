"use client";

import { type Address } from "viem";

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

      {/* Claim button */}
      <button
        type="button"
        onClick={onClaim}
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
        Claiming requires a small gas fee in MON for the transaction.
      </p>
    </div>
  );
}
