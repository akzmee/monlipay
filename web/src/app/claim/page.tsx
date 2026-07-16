"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount, useBalance, useChainId } from "wagmi";
import { formatEther, type Hex } from "viem";
import { useDeposit, useClaimLink } from "@/hooks/useLinkVault";
import { parseClaimUrl } from "@/lib/crypto";
import { monadChain, LINK_VAULT_ADDRESS } from "@/config/chain";
import { ClaimForm } from "@/components/ClaimForm";

function ClaimPageContent() {
  const searchParams = useSearchParams();
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const parsed = parseClaimUrl(hash);
  const depositId = parsed?.depositId ?? null;
  const secretKey = parsed?.secretKey ?? null;

  const { data: deposit, isLoading: depositLoading, refetch } = useDeposit(depositId);
  const { claim, error, isSending, isConfirming, isSuccess, reset } = useClaimLink();
  const [recipientOverride, setRecipientOverride] = useState("");

  // Determine the effective recipient
  const effectiveRecipient = (recipientOverride || address || "0x0000000000000000000000000000000000000000") as `0x${string}`;

  // If the deposit is loaded, check validity
  if (depositLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-neutral-500">Loading payment link...</div>
      </div>
    );
  }

  // Invalid link format
  if (!parsed) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40">
          <svg
            className="h-7 w-7 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-xl font-bold">Invalid link</h1>
        <p className="mt-2 text-sm text-neutral-500">
          This payment link is malformed. Ask the sender to share the full link again.
        </p>
      </div>
    );
  }

  // Deposit not found
  if (deposit && deposit.sender === "0x0000000000000000000000000000000000000000") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40">
          <svg
            className="h-7 w-7 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold">Link not found</h1>
        <p className="mt-2 text-sm text-neutral-500">
          This payment link doesn&apos;t exist or may have been removed.
        </p>
      </div>
    );
  }

  // Already claimed
  if (deposit?.claimed) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
          <svg
            className="h-7 w-7 text-neutral-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold">Already claimed</h1>
        <p className="mt-2 text-sm text-neutral-500">
          This payment link has already been claimed or refunded.
        </p>
      </div>
    );
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  const isExpired = deposit ? now >= Number(deposit.expiry) : false;

  if (isExpired) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40">
          <svg
            className="h-7 w-7 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold">Link expired</h1>
        <p className="mt-2 text-sm text-neutral-500">
          This payment link has expired. The sender can now refund the funds.
        </p>
      </div>
    );
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="hero-gradient">
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/40">
            <svg
              className="h-8 w-8 text-green-600 dark:text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">Funds claimed!</h1>
          <p className="mt-2 text-sm text-neutral-500">
            {deposit && formatEther(deposit.amount)} MON has been sent to your wallet.
          </p>
        </div>
      </div>
    );
  }

  // Main claim UI
  const isWrongChain = isConnected && chainId !== monadChain.id;
  const tokenSymbol = deposit?.token === "0x0000000000000000000000000000000000000000" ? "MON" : "TOKEN";
  const isBusy = isSending || isConfirming;

  return (
    <div className="hero-gradient">
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600 text-3xl">
            <span className="text-white">{"\u{1F389}"}</span>
          </div>
          <h1 className="text-2xl font-bold">You&apos;ve received MON!</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Claim your payment before it expires.
          </p>
        </div>

        {/* Payment details */}
        <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-500">Amount</span>
            <span className="text-xl font-bold">
              {deposit && formatEther(deposit.amount)} {tokenSymbol}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
            <span className="text-sm text-neutral-500">From</span>
            <span className="font-mono text-sm">
              {deposit?.sender.slice(0, 6)}...{deposit?.sender.slice(-4)}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
            <span className="text-sm text-neutral-500">Expires in</span>
            <CountdownTimer expiry={Number(deposit?.expiry ?? 0)} />
          </div>
        </div>

        {/* Wrong chain warning */}
        {isWrongChain && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
            Switch to Monad Testnet in your wallet to claim.
          </div>
        )}

        {/* Claim form */}
        <ClaimForm
          isConnected={isConnected}
          isBusy={isBusy}
          isWrongChain={isWrongChain}
          error={error}
          address={address}
          recipientOverride={recipientOverride}
          setRecipientOverride={setRecipientOverride}
          onClaim={() => {
            if (!secretKey || !depositId) return;
            claim({
              depositId,
              secretKey: secretKey as Hex,
              recipient: effectiveRecipient,
              chainId: monadChain.id,
            });
          }}
        />
      </div>
    </div>
  );
}

function CountdownTimer({ expiry }: { expiry: number }) {
  const [remaining, setRemaining] = useState(expiry - Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(expiry - Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [expiry]);

  if (remaining <= 0) return <span className="text-sm text-red-500">Expired</span>;

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  return (
    <span className="font-mono text-sm tabular-nums">
      {hours > 0 && `${hours}h `}
      {minutes}m {seconds}s
    </span>
  );
}

export default function ClaimPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="text-sm text-neutral-500">Loading...</div>
        </div>
      }
    >
      <ClaimPageContent />
    </Suspense>
  );
}
