"use client";

import { useState } from "react";
import { EXPIRY_PRESETS, type TokenInfo } from "@/config/chain";
import { useTokenRegistry } from "@/hooks/useTokenRegistry";
import { TokenAvatar } from "./TokenAvatar";
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
    <div className="mp-payment-form">
      {/* Amount + Token selector — DeFi style */}
      <div>
        <label htmlFor="amount" className="mp-label">
          Amount
        </label>
        <div className="mp-payment-amount">
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isBusy}
            className="mp-payment-amount-input"
          />
          {/* Token selector button */}
          <button
            type="button"
            onClick={() => setShowTokenModal(true)}
            disabled={isBusy}
            className="mp-payment-token"
          >
            {/* Token avatar — uses logoURI when available, gradient fallback otherwise */}
            <TokenAvatar token={selectedToken} size={28} />
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
      <fieldset>
        <legend className="mp-label">Expires in</legend>
        <div className="mp-expiry-options">
          {EXPIRY_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => setExpirySeconds(preset.value)}
              disabled={isBusy}
              aria-pressed={expirySeconds === preset.value}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Error */}
      {error && (
        <div className="mp-error" role="alert">
          {error}
        </div>
      )}

      <p className="mp-hint">
        You deposit {amount || "0"} {selectedToken.symbol}, plus network gas
        paid in MON.
        {!selectedToken.isNative &&
          " Your wallet may first ask you to approve this token, which also uses gas."}{" "}
        Review the exact network fee in your wallet before confirming.
      </p>

      {/* Submit */}
      <button
        type="button"
        onClick={onCreate}
        disabled={!isAmountValid || isBusy}
        className="mp-button mp-payment-submit"
      >
        {isBusy ? (
          <>
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
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
                d="M12 4.5v15m7.5-7.5h-15"
              />
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
        onSelect={(t) => setSelectedToken(t as TokenInfo)}
        onAddCustomToken={(t) => addToken(t as TokenInfo)}
        onRemoveCustomToken={removeToken}
        customTokenAddresses={customTokenAddresses}
      />
    </div>
  );
}
