"use client";

import { SUPPORTED_TOKENS, EXPIRY_PRESETS } from "@/config/chain";

interface CreateFormProps {
  amount: string;
  setAmount: (v: string) => void;
  selectedToken: (typeof SUPPORTED_TOKENS)[number];
  setSelectedToken: (t: (typeof SUPPORTED_TOKENS)[number]) => void;
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
  const isAmountValid = (() => {
    const n = parseFloat(amount);
    return !isNaN(n) && n > 0;
  })();

  return (
    <div className="space-y-4">
      {/* Token selector */}
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-500">
          Token
        </label>
        <div className="flex gap-2">
          {SUPPORTED_TOKENS.map((token) => (
            <button
              key={token.address}
              type="button"
              onClick={() => setSelectedToken(token)}
              className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                selectedToken.address === token.address
                  ? "border-red-400 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-950/40 dark:text-red-300"
                  : "border-stone-200 text-stone-600 hover:border-stone-300 dark:border-stone-700 dark:text-stone-400 dark:hover:border-stone-600"
              }`}
            >
              {token.symbol}
            </button>
          ))}
        </div>
      </div>

      {/* Amount */}
      <div>
        <label
          htmlFor="amount"
          className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-500"
        >
          Amount
        </label>
        <div className="relative">
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            placeholder="0.1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isBusy}
            className="w-full rounded-lg border border-stone-200 bg-white px-4 py-3 text-lg font-semibold outline-none transition-colors placeholder:font-normal placeholder:text-stone-400 focus:border-red-400 dark:border-stone-700 dark:bg-stone-800 dark:focus:border-red-500"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-stone-400">
            {selectedToken.symbol}
          </span>
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
                  ? "border-red-400 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-950/40 dark:text-red-300"
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
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={onCreate}
        disabled={!isAmountValid || isBusy}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-red-600 to-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:from-red-500 hover:to-orange-400 disabled:cursor-not-allowed disabled:from-stone-400 disabled:to-stone-400 disabled:shadow-none"
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
    </div>
  );
}
