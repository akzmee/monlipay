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
    <div className="space-y-4">
      {/* Amount + Token selector — DeFi style */}
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-800/50">
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-medium text-stone-500 dark:text-stone-400">
            Amount
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isBusy}
            className="min-w-0 flex-1 bg-transparent text-2xl font-bold outline-none placeholder:text-stone-400 dark:text-stone-100"
          />
          {/* Token selector button */}
          <button
            type="button"
            onClick={() => setShowTokenModal(true)}
            disabled={isBusy}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold shadow-sm transition-all hover:shadow-md active:scale-95 dark:bg-stone-700 dark:text-stone-100"
          >
            {/* Token avatar */}
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br ${
                selectedToken.isNative
                  ? "from-violet-500 to-purple-600"
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
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-500">
          Expires in
        </label>
        <div className="flex flex-wrap gap-2">
          {EXPIRY_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setExpirySeconds(preset.value)}
              disabled={isBusy}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                expirySeconds === preset.value
                  ? "border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-300"
                  : "border-stone-200 text-stone-600 hover:border-stone-300 dark:border-stone-700 dark:text-stone-400 dark:hover:border-stone-600"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-400">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={onCreate}
        disabled={!isAmountValid || isBusy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/40 disabled:cursor-not-allowed disabled:from-stone-400 disabled:to-stone-400 disabled:shadow-none"
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
          <>Create Payment Link</>
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
