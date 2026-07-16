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
    <div className="space-y-5">
      {/* Token selector */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
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
                  ? "border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-300"
                  : "border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600"
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
          className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
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
            className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-3 text-lg font-medium outline-none transition-colors placeholder:text-neutral-400 focus:border-violet-400 dark:border-neutral-700 dark:bg-neutral-800 dark:focus:border-violet-500"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-neutral-400">
            {selectedToken.symbol}
          </span>
        </div>
      </div>

      {/* Expiry */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
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
                  : "border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={onCreate}
        disabled={!isAmountValid || isBusy}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-500 active:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
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
            {isConfirmingMessage(isBusy)}
          </>
        ) : (
          <>Create Payment Link</>
        )}
      </button>
    </div>
  );
}

function isConfirmingMessage(_isBusy: boolean): string {
  return "Confirming...";
}
