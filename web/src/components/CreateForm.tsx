"use client";

import { useState } from "react";
import { EXPIRY_PRESETS, type TokenInfo } from "@/config/chain";
import { useTokenRegistry } from "@/hooks/useTokenRegistry";
import { TokenSelectModal } from "./TokenSelectModal";

interface CreateFormProps {
  amount: string;
  setAmount: (v: string) => void;
  selectedToken: TokenInfo;
  setSelectedToken: (t: TokenInfo) => void;
  expirySeconds: number;
  setExpirySeconds: (n: number) => void;
  onCreate: () => void;
  isBusy: boolean;
  error: string | null;
}

export function CreateForm({
  amount,
  setAmount,
  selectedToken,
  setSelectedToken,
  expirySeconds,
  setExpirySeconds,
  onCreate,
  isBusy,
  error,
}: CreateFormProps) {
  const [showTokenModal, setShowTokenModal] = useState(false);
  const { tokens, addToken, removeToken, customTokens } = useTokenRegistry();

  const isAmountValid = (() => {
    const n = parseFloat(amount);
    return !isNaN(n) && n > 0;
  })();

  // Set of custom token addresses for showing the "CUSTOM" badge
  const customTokenAddresses = new Set(
    customTokens.map((t) => t.address.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      {/* Amount + Token selector — DeFi style */}
      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 transition-colors focus-within:border-red-400 focus-within:bg-white dark:border-stone-700 dark:bg-stone-800/50 dark:focus-within:border-red-500 dark:focus-within:bg-stone-800">
        <label
          htmlFor="amount"
          className="mb-2 block text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400"
        >
          Amount
        </label>
        <div className="flex items-center gap-3">
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isBusy}
            className="min-w-0 flex-1 bg-transparent text-3xl font-bold text-stone-900 outline-none placeholder:text-stone-300 dark:text-stone-100 dark:placeholder:text-stone-600"
          />
          {/* Token selector button */}
          <button
            type="button"
            onClick={() => setShowTokenModal(true)}
            disabled={isBusy}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold shadow-sm transition-all hover:shadow-md active:scale-95 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-100"
          >
            {/* Token avatar */}
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${
                selectedToken.isNative
                  ? "from-red-500 to-orange-500"
                  : "from-blue-500 to-cyan-600"
              } text-xs font-bold text-white`}
            >
              {selectedToken.symbol.charAt(0)}
            </div>
            <span className="text-stone-900 dark:text-stone-100">
              {selectedToken.symbol}
            </span>
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
                d="M19.5 8.25l-7.5 7.5-7.5-7.5"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Expiry */}
      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
          Expires in
        </label>
        <div className="flex flex-wrap gap-2">
          {EXPIRY_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setExpirySeconds(preset.value)}
              disabled={isBusy}
              className={`rounded-xl border px-3.5 py-2 text-xs font-medium transition-all active:scale-95 ${
                expirySeconds === preset.value
                  ? "border-red-400 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-950/40 dark:text-red-300"
                  : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400 dark:hover:border-stone-600 dark:hover:bg-stone-700/50"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={onCreate}
        disabled={!isAmountValid || isBusy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-500 px-4 py-4 text-sm font-semibold text-white shadow-lg shadow-red-500/25 transition-all hover:shadow-xl hover:shadow-red-500/40 hover:from-red-500 hover:to-orange-400 active:scale-95 disabled:cursor-not-allowed disabled:from-stone-400 disabled:to-stone-400 disabled:shadow-none disabled:hover:from-stone-400 disabled:hover:to-stone-400"
      >
        {isBusy ? (
          <>
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
            Confirming...
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Payment Link
          </>
        )}
      </button>

      {/* Token selector modal */}
      <TokenSelectModal
        open={showTokenModal}
        onClose={() => setShowTokenModal(false)}
        tokens={tokens}
        selectedToken={selectedToken}
        onSelect={setSelectedToken}
        onAddCustomToken={addToken}
        onRemoveCustomToken={removeToken}
        customTokenAddresses={customTokenAddresses}
      />
    </div>
  );
}
