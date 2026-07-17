"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  QuoteRequest,
  QuoteResponse,
  BalanceResponse,
  StatusResponse,
} from "@/lib/bridge-types";
import { isTerminalStatus } from "@/lib/lifi-parse";

/**
 * Get the page origin in an SSR-safe way.
 * Falls back to empty string during SSR / build, which is fine because
 * these hooks are only invoked from event handlers (client-side only).
 */
function getOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

/**
 * Fetch bridge quote routes from our server-side API route.
 * The LI.FI API key is handled by the backend — this hook never sees it.
 */
export function useBridgeQuote() {
  const [routes, setRoutes] = useState<QuoteResponse["routes"]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuote = useCallback(async (params: QuoteRequest) => {
    setIsLoading(true);
    setError(null);

    try {
      const url = new URL("/api/bridge/quote", getOrigin());
      url.searchParams.set("fromChain", String(params.fromChain));
      url.searchParams.set("fromToken", params.fromToken);
      url.searchParams.set("fromAmount", params.fromAmount);
      url.searchParams.set("toChain", String(params.toChain));
      url.searchParams.set("toToken", params.toToken);
      url.searchParams.set("fromAddress", params.fromAddress);

      const res = await fetch(url.toString());
      const data = (await res.json()) as
        | QuoteResponse
        | { error: string; code: string };

      if (!res.ok) {
        const err = data as { error: string; code: string };
        setError(err.error || "Failed to fetch quote");
        setRoutes([]);
        return;
      }

      setRoutes((data as QuoteResponse).routes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch quote");
      setRoutes([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { routes, isLoading, error, fetchQuote, setRoutes };
}

/**
 * Fetch wallet balances across supported source chains.
 */
export function useBridgeBalance() {
  const [balances, setBalances] = useState<BalanceResponse["balances"]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = useCallback(
    async (address: string, chains?: number[]) => {
      setIsLoading(true);
      setError(null);

      try {
        const url = new URL("/api/bridge/balance", getOrigin());
        url.searchParams.set("address", address);
        if (chains?.length) {
          url.searchParams.set("chains", chains.join(","));
        }

        const res = await fetch(url.toString());
        const data = (await res.json()) as
          | BalanceResponse
          | { error: string; code: string };

        if (!res.ok) {
          const err = data as { error: string; code: string };
          setError(err.error || "Failed to fetch balances");
          setBalances([]);
          return;
        }

        setBalances((data as BalanceResponse).balances);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch balances",
        );
        setBalances([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return { balances, isLoading, error, fetchBalances, setBalances };
}

/** Polling interval for bridge status checks. */
const STATUS_POLL_INTERVAL_MS = 10_000;

/** Maximum number of polling attempts before giving up (30 min at 10s interval). */
const STATUS_MAX_ATTEMPTS = 180;

/**
 * Poll bridge transaction status until terminal or max attempts reached.
 *
 * Fixes:
 *   - H2: Polling no longer runs forever. After STATUS_MAX_ATTEMPTS, it stops.
 *   - H3: All async errors are caught and recorded.
 *   - L4: Uses getOrigin() for SSR safety.
 *   - H1/H11: Status normalization happens server-side now, but we also
 *     double-check using isTerminalStatus() for defense in depth.
 */
export function useBridgeStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const checkStatus = useCallback(
    async (txHash: string, bridge: string) => {
      attemptsRef.current += 1;

      // Stop after max attempts to prevent infinite polling
      if (attemptsRef.current > STATUS_MAX_ATTEMPTS) {
        setError(
          `Status polling timed out after ${STATUS_MAX_ATTEMPTS} attempts`,
        );
        stopPolling();
        return;
      }

      try {
        const url = new URL("/api/bridge/status", getOrigin());
        url.searchParams.set("txHash", txHash);
        url.searchParams.set("bridge", bridge);

        const res = await fetch(url.toString());
        const data = (await res.json()) as
          | StatusResponse
          | { error: string; code: string };

        if (!res.ok) {
          const err = data as { error: string; code: string };
          setError(err.error || "Failed to fetch status");
          return;
        }

        const statusData = data as StatusResponse;
        setStatus(statusData);

        // Stop polling if terminal state reached
        if (isTerminalStatus(statusData.status)) {
          stopPolling();
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch status",
        );
      }
    },
    [stopPolling],
  );

  const startPolling = useCallback(
    (txHash: string, bridge: string) => {
      stopPolling();
      attemptsRef.current = 0;
      setError(null);
      setIsPolling(true);
      // Initial check immediately
      void checkStatus(txHash, bridge);
      // Then poll every STATUS_POLL_INTERVAL_MS
      intervalRef.current = setInterval(() => {
        void checkStatus(txHash, bridge);
      }, STATUS_POLL_INTERVAL_MS);
    },
    [checkStatus, stopPolling],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  return {
    status,
    isPolling,
    error,
    startPolling,
    stopPolling,
  };
}
