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
      // Clear stale error from a previous attempt before starting a new one.
      reset();
      setBusyDepositIds((prev) => new Set(prev).add(id));

      try {
        await refund(depositId);
        onSuccess?.();
      } finally {
        setBusyDepositIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [refund, reset],
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
