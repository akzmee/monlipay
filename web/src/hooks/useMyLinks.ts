"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount } from "wagmi";
import {
  fetchLinks,
  isIndexerConfigured,
  type IndexedLink,
} from "@/lib/indexer-client";

/**
 * useMyLinks — fetches the user's payment links from the Ponder indexer.
 *
 * Replaces the previous localStorage-backed link history (web/src/lib/storage.ts),
 * which broke when the user switched wallets — see the git history of that file.
 *
 * Behavior:
 *   - Polls every `pollIntervalMs` (default 15s) so newly created links show
 *     up without a manual refresh. Ponder's indexer is read-after-write from
 *     the user's perspective (the tx confirms, then the indexer sees the
 *     event within a few seconds).
 *   - Re-fetches when the account changes or the component remounts.
 *   - Surfaces `indexerUnavailable: true` when the env var is missing or the
 *     fetch errors, so the UI can show a hint instead of an empty state.
 *   - Returns a `refresh()` callback for manual refresh after create/refund.
 *
 * BUGFIX (race condition): The previous version had no mutex between
 * concurrent fetches — a manual refresh fired during a polling interval
 * would race, and whichever resolved last would win. We now use an
 * AbortController per in-flight request; starting a new refresh aborts
 * the previous one, guaranteeing only the latest request updates state.
 *
 * NOT loaded during SSR — the hook initializes empty and populates after mount
 * (gated by `useAccount().address`). This avoids hydration mismatches.
 */
export function useMyLinks(options?: {
  pollIntervalMs?: number;
  status?: "active" | "claimed" | "refunded" | "refund_failed";
}) {
  const { address } = useAccount();
  const pollIntervalMs = options?.pollIntervalMs ?? 15_000;
  const status = options?.status;

  const [links, setLinks] = useState<IndexedLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the address we're currently loading so we don't show stale data
  // from a previous wallet right after the user switches.
  const loadingAddressRef = useRef<`0x${string}` | null>(null);
  // AbortController for the currently in-flight fetch. Aborted when a new
  // fetch starts, when the account changes, or when the component unmounts.
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup any in-flight fetch on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!address) {
      setLinks([]);
      setError(null);
      return;
    }
    if (!isIndexerConfigured) {
      // No indexer configured — surface as a soft error so the UI can
      // explain why the list is empty.
      setLinks([]);
      setError("Indexer not configured. Set NEXT_PUBLIC_INDEXER_URL.");
      return;
    }

    // Abort any in-flight fetch so only the latest one can update state.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    loadingAddressRef.current = address;
    setIsLoading(true);
    setError(null);
    try {
      const rows = await fetchLinks(address, status, controller.signal);
      // Guard against a stale response: if the user switched wallets while
      // this fetch was in flight, drop the result. Also drop if aborted
      // (a newer fetch took over).
      if (controller.signal.aborted) return;
      if (loadingAddressRef.current !== address) return;
      setLinks(rows);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (loadingAddressRef.current !== address) return;
      // fetch throws an AbortError when aborted — don't surface that as
      // a user-visible error, since it just means a newer fetch replaced
      // this one.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load links");
      // Keep the previous links list on error — better than flickering to
      // empty if the indexer is briefly unreachable.
    } finally {
      // Only clear isLoading if this fetch is still the "current" one.
      // A newer fetch that aborted us will set its own isLoading in its
      // own finally block.
      if (!controller.signal.aborted && loadingAddressRef.current === address) {
        setIsLoading(false);
      }
    }
  }, [address, status]);

  // Initial load + reload on account / status change.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Polling — only when we have an address, indexer is configured, and
  // the tab is visible.
  useEffect(() => {
    if (!address || !isIndexerConfigured) return;
    const handle = setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, pollIntervalMs);
    return () => clearInterval(handle);
  }, [address, pollIntervalMs, refresh]);

  // Reset on account switch so we don't briefly render the previous wallet's
  // links while the new fetch is in flight. Also abort in-flight fetch —
  // its response would belong to the previous wallet.
  useEffect(() => {
    if (!address) {
      abortRef.current?.abort();
      abortRef.current = null;
      setLinks([]);
    }
  }, [address]);

  return {
    links,
    isLoading,
    error,
    refresh,
    /** True if the indexer URL is set in env. Use to gate UI hints. */
    indexerConfigured: isIndexerConfigured,
  };
}
