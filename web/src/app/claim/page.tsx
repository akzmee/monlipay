"use client";

import { useState, useEffect, useSyncExternalStore, Suspense } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { isAddress, type Hex } from "viem";
import { useDeposit, useClaimLink } from "@/hooks/useLinkVault";
import { parseClaimUrl } from "@/lib/crypto";
import { monadChain, SUPPORTED_TOKENS } from "@/config/chain";
import { isGasSponsorAvailable } from "@/config/gas-sponsor";
import { sponsorClaim } from "@/lib/sponsor-client";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { historyAmount } from "@/lib/link-history";
import { ClaimForm } from "@/components/ClaimForm";
import { useConnectModal } from "@/components/WalletEntryContext";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
function ClaimPageContent() {
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => null,
  );
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [switchError, setSwitchError] = useState("");

  const parsed = parseClaimUrl(hash ?? "");
  const depositId = parsed?.depositId ?? null;
  const secretKey = parsed?.secretKey ?? null;

  const { data: deposit, isLoading: depositLoading } = useDeposit(depositId);
  const knownToken = SUPPORTED_TOKENS.find(
    (t) => t.address.toLowerCase() === deposit?.token.toLowerCase(),
  );
  const { metadata } = useTokenMetadata(
    knownToken ? null : (deposit?.token ?? null),
  );
  const token = knownToken ?? metadata;
  const amountLabel = deposit
    ? historyAmount(deposit.amount, token?.decimals, token?.symbol)
    : "Loading amount…";
  const { claim, error, isSending, isConfirming, isSuccess, txHash } =
    useClaimLink();
  const [recipientOverride, setRecipientOverride] = useState("");

  // Sponsor-claim state. When the user clicks claim, we try the sponsor
  // path first (if available) and fall back to direct claim on any
  // failure. This state mirrors the direct-claim hook so the UI can show
  // a single consistent loading + success state.
  const [sponsorBusy, setSponsorBusy] = useState(false);
  const [sponsorSuccess, setSponsorSuccess] = useState(false);
  const [sponsorError, setSponsorError] = useState<string | null>(null);
  const [sponsorTxHash, setSponsorTxHash] = useState<`0x${string}` | null>(
    null,
  );

  // Combined busy/success/error across both paths.
  const isBusy = isSending || isConfirming || sponsorBusy;
  const isSuccessOverall = isSuccess || sponsorSuccess;
  const errorOverall = error ?? sponsorError;
  const successTxHash = txHash ?? sponsorTxHash;

  // FIX S1: Validate the override address before using it.
  // Fall back to the connected wallet, or zero-address sentinel (contract will reject).
  const trimmedOverride = recipientOverride.trim();
  const isOverrideValid =
    trimmedOverride.length > 0 && isAddress(trimmedOverride);
  const effectiveRecipient = isOverrideValid
    ? (trimmedOverride as `0x${string}`)
    : (address ??
      ("0x0000000000000000000000000000000000000000" as `0x${string}`));

  // While hash hasn't been read yet (SSR first paint), show loading
  if (hash === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-stone-500">Loading payment link...</div>
      </div>
    );
  }

  if (depositLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-stone-500">Loading payment link...</div>
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
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold">Invalid link</h1>
        <p className="mt-2 text-sm text-stone-500">
          This payment link is malformed. Ask the sender to share the full link
          again.
        </p>
      </div>
    );
  }

  // Deposit not found
  if (
    deposit &&
    deposit.sender === "0x0000000000000000000000000000000000000000"
  ) {
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
        <p className="mt-2 text-sm text-stone-500">
          This payment link doesn&apos;t exist or may have been removed.
        </p>
      </div>
    );
  }

  // Already claimed
  if (deposit?.claimed && !isSuccessOverall) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800">
          <svg
            className="h-7 w-7 text-stone-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold">Already claimed</h1>
        <p className="mt-2 text-sm text-stone-500">
          This payment link has already been claimed or refunded.
        </p>
      </div>
    );
  }

  // Check expiry
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
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-bold">Link expired</h1>
        <p className="mt-2 text-sm text-stone-500">
          This payment link has expired. The sender can now refund the funds.
        </p>
      </div>
    );
  }

  // Success state
  if (isSuccessOverall) {
    return (
      <div className="mp-workspace mp-payment-claim">
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950/40">
            <svg
              className="h-8 w-8 text-green-600 dark:text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold">Funds claimed!</h1>
          <p className="mt-2 text-sm text-stone-500">
            {amountLabel} has been sent to the receiving wallet.
          </p>
          {successTxHash && (
            <a
              href={`${monadChain.blockExplorers?.default.url ?? "https://monadscan.com"}/tx/${successTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                />
              </svg>
              View transaction
            </a>
          )}
        </div>
      </div>
    );
  }

  // Main claim UI
  const isWrongChain = isConnected && chainId !== monadChain.id;

  return (
    <div className="mp-workspace mp-payment-claim">
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold">
            You&apos;ve received a payment
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Claim your payment before it expires.
          </p>
        </div>

        {/* Payment details */}
        <div className="mp-panel p-5 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-500">Amount</span>
            <span className="text-xl font-bold">{amountLabel}</span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3 dark:border-stone-800">
            <span className="text-sm text-stone-500">From</span>
            <span className="font-mono text-sm">
              {deposit?.sender.slice(0, 6)}...{deposit?.sender.slice(-4)}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3 dark:border-stone-800">
            <span className="text-sm text-stone-500">Expires in</span>
            <CountdownTimer expiry={Number(deposit?.expiry ?? 0)} />
          </div>
        </div>

        {/* Wrong chain warning */}
        {isWrongChain && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
            <p>This payment uses {monadChain.name}.</p>
            <button type="button" className="mp-button mt-3" disabled={switching} onClick={async () => {
              setSwitchError("");
              try { await switchChainAsync({ chainId: monadChain.id }); }
              catch { setSwitchError("Network switch was not completed. Try again when ready."); }
            }}>{switching ? "Switching…" : `Switch to ${monadChain.name}`}</button>
            {switchError && <p className="mt-2" role="alert">{switchError}</p>}
          </div>
        )}

        {/* Claim form */}
        <ClaimForm
          isConnected={isConnected}
          onConnect={openConnectModal}
          isBusy={isBusy}
          isWrongChain={isWrongChain}
          error={errorOverall}
          address={address}
          recipientOverride={recipientOverride}
          setRecipientOverride={(value) => {
            setRecipientOverride(value);
            setSponsorError(null);
          }}
          recipientError={
            trimmedOverride.length > 0 && !isOverrideValid
              ? "Invalid Ethereum address"
              : null
          }
          onClaim={async () => {
            if (!secretKey || !depositId) return;

            // Try sponsor path first (if configured). On any failure, fall
            // back to direct user-paid claim. This dual-mode approach lets
            // the app gracefully degrade if the sponsor is down, rate
            // limited, or out of budget.
            if (isGasSponsorAvailable) {
              setSponsorBusy(true);
              setSponsorError(null);
              try {
                const result = await sponsorClaim({
                  depositId,
                  secretKey: secretKey as Hex,
                  recipient: effectiveRecipient,
                });
                if (result.ok) {
                  setSponsorSuccess(true);
                  setSponsorTxHash(result.txHash);
                  return;
                }
                // If the failure is "rate_limited" or "budget_exhausted",
                // don't silently fall back — the user might want to wait.
                // For "not_configured", "invalid_request", "network_error",
                // and "relay_failed", we fall back to direct claim.
                if (
                  result.reason === "rate_limited" ||
                  result.reason === "budget_exhausted"
                ) {
                  setSponsorError(
                    result.message ??
                      "Sponsor unavailable. Please try again later or claim directly.",
                  );
                  setSponsorBusy(false);
                  return;
                }
                // Other failures: log and fall through to direct claim
                console.warn(
                  "[claim] Sponsor path failed, falling back to direct:",
                  result.reason,
                  result.message,
                );
              } catch (err) {
                console.warn(
                  "[claim] Sponsor path threw, falling back to direct:",
                  err,
                );
              } finally {
                setSponsorBusy(false);
              }
            }

            // Direct claim path (user pays gas)
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
  const [remaining, setRemaining] = useState(
    () => expiry - Math.floor(Date.now() / 1000),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(expiry - Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [expiry]);

  if (remaining <= 0)
    return <span className="text-sm text-red-500">Expired</span>;

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
          <div className="text-sm text-stone-500">Loading...</div>
        </div>
      }
    >
      <ClaimPageContent />
    </Suspense>
  );
}
