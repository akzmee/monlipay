"use client";

import {
  useAccount,
  useReadContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useState, useCallback } from "react";
import { parseEther, type Hex } from "viem";
import { linkVaultAbi } from "@/lib/abi";
import { LINK_VAULT_ADDRESS } from "@/config/chain";
import { generateSecretKey, privateKeyToClaimKey, buildShareableUrl } from "@/lib/crypto";
import { addStoredLink } from "@/lib/storage";

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
 * Handles the full flow:
 * 1. Generate ephemeral keypair
 * 2. Call createLink on the contract
 * 3. Wait for confirmation
 * 4. Return the shareable URL
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
        const amountWei = parseEther(params.amount);

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

        // 5. Extract deposit ID from events
        // The createLink function returns depositId, but we need to parse logs
        // to get it since sendTransaction doesn't decode return values.
        // We can read nextDepositId before and after, or parse the event log.
        if (receipt.status === "success") {
          // Find the LinkCreated event in logs
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

                  // Save to localStorage for "My Links" tracking
                  addStoredLink({
                    depositId: depositId.toString(),
                    token: params.token,
                    amount: params.amount,
                    expiry: expiryTimestamp,
                    createdAt: Math.floor(Date.now() / 1000),
                    sender: address,
                  });

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
