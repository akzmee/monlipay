"use client";

import { useRefundLink } from "./useLinkVault";
import { useState, useCallback } from "react";

/**
 * Hook to manage refunding links from the My Links page.
 * Tracks which deposit IDs are currently being refunded.
 */
export function useRefundMultiple() {
  const { refund, isSending, isConfirming, isSuccess, error, reset } = useRefundLink();
  const [busyDepositIds, setBusyDepositIds] = useState<Set<string>>(new Set());

  const refundMultiple = useCallback(
    async (depositId: bigint, onSuccess?: () => void) => {
      const id = depositId.toString();
      setBusyDepositIds((prev) => new Set(prev).add(id));

      try {
        await refund(depositId);
        // The useRefundLink hook is async but we need to wait for the result.
        // Since it manages its own state, we add a small delay to let the state settle.
        await new Promise((resolve) => setTimeout(resolve, 500));
        onSuccess?.();
      } finally {
        setBusyDepositIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [refund],
  );

  return {
    refundMultiple,
    busyDepositIds,
    isSending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}
