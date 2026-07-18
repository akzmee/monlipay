"use client";

import {
  useAccount,
  useReadContract,
  useSendTransaction,
} from "wagmi";
import { useState, useCallback, useRef, useEffect } from "react";
import { parseUnits, type Hex } from "viem";
import { linkVaultAbi } from "@/lib/abi";
import { LINK_VAULT_ADDRESS } from "@/config/chain";
import { generateSecretKey, privateKeyToClaimKey, buildShareableUrl } from "@/lib/crypto";

/**
 * Deposit data structure matching the contract's struct.
 */
export interface Deposit {
  sender: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  claimKey: `0x${string}`;
  expiry: number;
  claimed: boolean;
}

/**
 * Read a deposit by ID.
 */
export function useDeposit(depositId: bigint | null) {
  return useReadContract({
    address: LINK_VAULT_ADDRESS,
    abi: linkVaultAbi,
    functionName: "getDeposit",
    args: depositId !== null ? [depositId] : undefined,
    query: {
      enabled: depositId !== null,
    },
  });
}

/**
 * Check if a deposit exists.
 */
export function useDepositExists(depositId: bigint | null) {
  return useReadContract({
    address: LINK_VAULT_ADDRESS,
    abi: linkVaultAbi,
    functionName: "exists",
    args: depositId !== null ? [depositId] : undefined,
    query: {
      enabled: depositId !== null,
    },
  });
}

/**
 * Create a payment link.
 */
export function useCreateLink() {
  const { address } = useAccount();
  const { sendTransactionAsync, isPending: isSending, data: txHash } = useSendTransaction();
  const [isConfirming, setIsConfirming] = useState(false);
  const [result, setResult] = useState<{
    depositId: bigint;
    shareableUrl: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (params: {
      token: `0x${string}`;
      amount: string; // in ether units, will be parsed
      expirySeconds: number;
      isNative: boolean;
      decimals?: number; // defaults to 18 (native MON)
      baseUrl: string;
    }) => {
      setError(null);
      setResult(null);

      if (!address) {
        setError("Wallet not connected");
        return;
      }

      try {
        // 1. Generate ephemeral keypair
        const secretKey = generateSecretKey();
        const claimKey = privateKeyToClaimKey(secretKey);

        // 2. Prepare the transaction
        const expiryTimestamp = Math.floor(Date.now() / 1000) + params.expirySeconds;
        const decimals = params.decimals ?? 18;
        const amountWei = parseUnits(params.amount, decimals);

        // Encode the createLink call
        const { encodeFunctionData } = await import("viem");
        const txData = encodeFunctionData({
          abi: linkVaultAbi,
          functionName: "createLink",
          args: [params.token, amountWei, claimKey, expiryTimestamp],
        });

        // 3. Send transaction
        const hash = await sendTransactionAsync({
          to: LINK_VAULT_ADDRESS,
          data: txData,
          value: params.isNative ? amountWei : 0n,
        });

        // 4. Wait for receipt
        setIsConfirming(true);
        const { waitForTransactionReceipt } = await import("wagmi/actions");
        const { wagmiConfig } = await import("@/config/wagmi");
        const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

        // 5. Extract deposit ID from the LinkCreated event log.
        if (receipt.status === "success") {
          const { decodeEventLog } = await import("viem");
          for (const log of receipt.logs) {
            if (log.address.toLowerCase() === LINK_VAULT_ADDRESS.toLowerCase()) {
              try {
                const decoded = decodeEventLog({
                  abi: linkVaultAbi,
                  data: log.data,
                  topics: log.topics,
                });
                if (decoded.eventName === "LinkCreated") {
                  const depositId = (decoded.args as { depositId: bigint }).depositId;
                  const url = buildShareableUrl(params.baseUrl, depositId, secretKey);

                  // The indexer surfaces this link on the My Links page
                  // via the LinkCreated event — no localStorage write needed.
                  // The shareableUrl (with secret key) is only available
                  // in-memory here; ShareLink warns the user to save it.
                  setResult({ depositId, shareableUrl: url });
                  return;
                }
              } catch {
                // Skip logs that don't match
              }
            }
          }
          setError("Transaction succeeded but could not find deposit ID in logs");
        } else {
          setError("Transaction reverted");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create payment link");
      } finally {
        setIsConfirming(false);
      }
    },
    [address, sendTransactionAsync],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    create,
    result,
    error,
    isSending,
    isConfirming,
    txHash,
    reset,
  };
}

/**
 * Claim a payment link.
 * Signs the claim message with the secret key and submits to the contract.
 */
export function useClaimLink() {
  const { sendTransactionAsync, isPending: isSending, data: txHash } = useSendTransaction();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const claim = useCallback(
    async (params: {
      depositId: bigint;
      secretKey: Hex;
      recipient: `0x${string}`;
      chainId: number;
    }) => {
      setError(null);
      setIsSuccess(false);

      try {
        // 1. Sign the claim with the secret key
        const { signClaim } = await import("@/lib/crypto");
        const { v, r, s } = await signClaim({
          privateKey: params.secretKey,
          depositId: params.depositId,
          recipient: params.recipient,
          chainId: params.chainId,
          verifyingContract: LINK_VAULT_ADDRESS,
        });

        // 2. Encode the claim call
        const { encodeFunctionData } = await import("viem");
        const txData = encodeFunctionData({
          abi: linkVaultAbi,
          functionName: "claim",
          args: [params.depositId, params.recipient, v, r, s],
        });

        // 3. Send transaction
        const hash = await sendTransactionAsync({
          to: LINK_VAULT_ADDRESS,
          data: txData,
        });

        // 4. Wait for receipt
        setIsConfirming(true);
        const { waitForTransactionReceipt } = await import("wagmi/actions");
        const { wagmiConfig } = await import("@/config/wagmi");
        const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

        if (receipt.status === "success") {
          setIsSuccess(true);
        } else {
          setError("Claim transaction reverted");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to claim payment link");
      } finally {
        setIsConfirming(false);
      }
    },
    [sendTransactionAsync],
  );

  const reset = useCallback(() => {
    setError(null);
    setIsSuccess(false);
  }, []);

  return {
    claim,
    error,
    isSending,
    isConfirming,
    txHash,
    isSuccess,
    reset,
  };
}

/**
 * Refund an expired payment link.
 */
export function useRefundLink() {
  const { sendTransactionAsync, isPending: isSending, data: txHash } = useSendTransaction();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const refund = useCallback(
    async (depositId: bigint) => {
      setError(null);
      setIsSuccess(false);

      try {
        const { encodeFunctionData } = await import("viem");
        const txData = encodeFunctionData({
          abi: linkVaultAbi,
          functionName: "refund",
          args: [depositId],
        });

        const hash = await sendTransactionAsync({
          to: LINK_VAULT_ADDRESS,
          data: txData,
        });

        setIsConfirming(true);
        const { waitForTransactionReceipt } = await import("wagmi/actions");
        const { wagmiConfig } = await import("@/config/wagmi");
        const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

        if (receipt.status === "success") {
          setIsSuccess(true);
        } else {
          setError("Refund transaction reverted");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to refund payment link");
      } finally {
        setIsConfirming(false);
      }
    },
    [sendTransactionAsync],
  );

  const reset = useCallback(() => {
    setError(null);
    setIsSuccess(false);
  }, []);

  return {
    refund,
    error,
    isSending,
    isConfirming,
    txHash,
    isSuccess,
    reset,
  };
}

/**
 * Auto-refund expired payment links.
 * Pulls ACTIVE-but-expired links from the Ponder indexer (source of truth
 * for which links this wallet owns), then calls `autoRefund(depositId)` for
 * each. Idempotent — reverted autoRefund calls (already claimed) are caught
 * silently.
 *
 * `address` is passed in by the caller rather than read from useAccount so
 * the binding is explicit; useAccount is still used internally to reset
 * state on disconnect.
 */
export function useAutoRefundExpiredLinks() {
  const { sendTransactionAsync } = useSendTransaction();
  const { address: connectedAddress } = useAccount();
  const [isProcessing, setIsProcessing] = useState(false);
  const [refundedCount, setRefundedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [failedDepositIds, setFailedDepositIds] = useState<Set<string>>(new Set());

  // Mutex ref — guards against concurrent invocations racing on wallet nonces.
  const isProcessingRef = useRef(false);

  // Reset state and abort in-flight batch on disconnect.
  useEffect(() => {
    if (!connectedAddress) {
      setIsProcessing(false);
      setRefundedCount(0);
      setError(null);
      setFailedDepositIds(new Set());
      isProcessingRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  }, [connectedAddress]);

  // AbortController for the current batch — cancelled on unmount or account change.
  const abortControllerRef = useRef<AbortController | null>(null);

  const processExpiredLinks = useCallback(async (address: `0x${string}`) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsProcessing(true);
    setError(null);
    setFailedDepositIds(new Set());
    let successCount = 0;
    const newFailedIds = new Set<string>();

    try {
      // Pull expired active links from the Ponder indexer.
      // If the indexer is not configured, this returns [] silently and
      // we exit with refundedCount=0 — the manual refund button on each
      // LinkCard still works as a fallback.
      const { fetchExpiredLinks, isIndexerConfigured } = await import("@/lib/indexer-client");
      if (!isIndexerConfigured) {
        setRefundedCount(0);
        return;
      }

      const expiredLinks = await fetchExpiredLinks(address, controller.signal);
      if (controller.signal.aborted) return;

      if (expiredLinks.length === 0) {
        setRefundedCount(0);
        return;
      }

      const { encodeFunctionData } = await import("viem");
      const { waitForTransactionReceipt } = await import("wagmi/actions");
      const { wagmiConfig } = await import("@/config/wagmi");

      // Sequential — parallel sendTransactionAsync calls risk nonce collisions.
      for (const link of expiredLinks) {
        // Bail if aborted.
        if (controller.signal.aborted) return;

        try {
          const txData = encodeFunctionData({
            abi: linkVaultAbi,
            functionName: "autoRefund",
            args: [link.depositId],
          });

          const hash = await sendTransactionAsync({
            to: LINK_VAULT_ADDRESS,
            data: txData,
          });

          if (controller.signal.aborted) return;

          const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

          if (controller.signal.aborted) return;

          if (receipt.status === "success") {
            // No local status to update — the indexer will pick up
            // the LinkRefunded event and the next useMyLinks refresh
            // will show the new state.
            successCount++;
          } else {
            // Reverted tx — surface as a per-link failure
            newFailedIds.add(link.depositId.toString());
          }
        } catch {
          // Per-link failure (race, wallet rejection) — surfaced via failedDepositIds.
          newFailedIds.add(link.depositId.toString());
        }
      }

      setRefundedCount(successCount);
      setFailedDepositIds(newFailedIds);

      // Top-level error only on full failure; partial failures use failedDepositIds.
      if (successCount === 0 && newFailedIds.size > 0) {
        setError(
          `Could not auto-refund ${newFailedIds.size} link${newFailedIds.size === 1 ? "" : "s"}. ` +
          "They may have been claimed or refunded in a race. Try a manual refund.",
        );
      }
    } catch (err) {
      // Top-level error (not per-link) — typically a fetch failure
      // against the indexer. The manual refund button still works.
      setError(
        err instanceof Error ? err.message : "Failed to load expired links from indexer",
      );
    } finally {
      // Only update state if this batch wasn't aborted. Aborted batches
      // leave state to be reset by the aborter (the useEffect on disconnect).
      if (!controller.signal.aborted) {
        setIsProcessing(false);
      }
      isProcessingRef.current = false;
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [sendTransactionAsync]);

  const reset = useCallback(() => {
    setRefundedCount(0);
    setError(null);
    setFailedDepositIds(new Set());
  }, []);

  return {
    processExpiredLinks,
    isProcessing,
    refundedCount,
    error,
    failedDepositIds,
    reset,
  };
}
