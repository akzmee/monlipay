"use client";

import { useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { useCreateLink } from "@/hooks/useLinkVault";
import { SUPPORTED_TOKENS, EXPIRY_PRESETS, isContractDeployed, LINK_VAULT_ADDRESS, monadChain } from "@/config/chain";
import { CreateForm } from "@/components/CreateForm";
import { ShareLink } from "@/components/ShareLink";

export default function HomePage() {
  const { isConnected } = useAccount();
  const { create, result, error, isSending, isConfirming, reset } = useCreateLink();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState(SUPPORTED_TOKENS[0]);
  const [expirySeconds, setExpirySeconds] = useState<number>(EXPIRY_PRESETS[2].value);

  const isBusy = isSending || isConfirming;
  const isWrongChain = isConnected && chainId !== monadChain.id;

  if (result) {
    return (
      <div className="hero-gradient">
        <div className="mx-auto max-w-2xl px-4 py-16">
          <ShareLink url={result.shareableUrl} onReset={reset} />
        </div>
      </div>
    );
  }

  return (
    <div className="hero-gradient min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-md px-4 py-8 sm:py-10">
        {/* Contract not deployed warning */}
        {!isContractDeployed && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
              Contract not deployed yet. Set{" "}
              <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">
                NEXT_PUBLIC_LINK_VAULT_ADDRESS
              </code>{" "}
              in <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/50">.env.local</code>.
            </p>
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Current: <code>{LINK_VAULT_ADDRESS.slice(0, 10)}...</code>
            </p>
          </div>
        )}

        {/* Hero — compact, fits viewport */}
        <div className="mb-6 text-center">
          <h1 className="mb-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Send MON via link
          </h1>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            Share via WhatsApp. Recipient claims with one tap.
          </p>
        </div>

        {/* Create form */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-6">
          {!isConnected ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
                <svg
                  className="h-6 w-6 text-red-600 dark:text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold">Connect your wallet</h2>
                <p className="mt-1 text-xs text-stone-500">
                  Connect MetaMask to create a payment link
                </p>
              </div>
            </div>
          ) : !isContractDeployed ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40">
                <svg
                  className="h-6 w-6 text-red-600 dark:text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold">Contract not deployed</h2>
                <p className="mt-1 text-xs text-stone-500">
                  Deploy LinkVault.sol and set the address in .env.local
                </p>
              </div>
            </div>
          ) : isWrongChain ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40">
                <svg
                  className="h-6 w-6 text-amber-600 dark:text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold">Wrong network</h2>
                <p className="mt-1 text-xs text-stone-500">
                  You&apos;re connected to the wrong chain. Switch to Monad Testnet to create payment links.
                </p>
              </div>
              <button
                onClick={async () => {
                  try {
                    await switchChainAsync({ chainId: monadChain.id });
                  } catch {
                    // User rejected
                  }
                }}
                className="mt-2 rounded-lg bg-gradient-to-r from-red-600 to-orange-500 px-4 py-2 text-sm font-medium text-white transition-all hover:from-red-500 hover:to-orange-400"
              >
                Switch to Monad Testnet
              </button>
            </div>
          ) : (
            <CreateForm
              amount={amount}
              setAmount={setAmount}
              selectedToken={selectedToken}
              setSelectedToken={setSelectedToken}
              expirySeconds={expirySeconds}
              setExpirySeconds={setExpirySeconds}
              onCreate={() =>
                create({
                  token: selectedToken.address,
                  amount,
                  expirySeconds,
                  isNative: selectedToken.isNative,
                  baseUrl:
                    typeof window !== "undefined" ? window.location.origin : "",
                })
              }
              isBusy={isBusy}
              error={error}
            />
          )}
        </div>
      </div>
    </div>
  );
}
