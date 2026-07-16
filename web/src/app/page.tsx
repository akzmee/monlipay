"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useCreateLink } from "@/hooks/useLinkVault";
import { SUPPORTED_TOKENS, EXPIRY_PRESETS } from "@/config/chain";
import { CreateForm } from "@/components/CreateForm";
import { ShareLink } from "@/components/ShareLink";

export default function HomePage() {
  const { isConnected } = useAccount();
  const { create, result, error, isSending, isConfirming, reset } = useCreateLink();

  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState(SUPPORTED_TOKENS[0]);
  const [expirySeconds, setExpirySeconds] = useState<number>(EXPIRY_PRESETS[2].value);

  const isBusy = isSending || isConfirming;

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
    <div className="hero-gradient">
      <div className="mx-auto max-w-2xl px-4 py-16">
        {/* Hero */}
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Send MON via link
          </h1>
          <p className="mx-auto max-w-md text-base text-neutral-600 dark:text-neutral-400">
            Generate a payment link, share it on WhatsApp or Telegram. Recipient
            claims with one click. Unclaimed funds? Take them back anytime.
          </p>
        </div>

        {/* Create form */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
          {!isConnected ? (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-950/50">
                <svg
                  className="h-7 w-7 text-violet-600 dark:text-violet-400"
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
                <h2 className="text-lg font-semibold">Connect your wallet</h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Connect MetaMask or any wallet to create a payment link.
                </p>
              </div>
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

        {/* How it works */}
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              step: "1",
              title: "Create link",
              desc: "Set amount and expiry. Your wallet signs one transaction.",
            },
            {
              step: "2",
              title: "Share",
              desc: "Copy the link, paste in WhatsApp or Telegram.",
            },
            {
              step: "3",
              title: "Claim or refund",
              desc: "Recipient claims instantly. Unclaimed? Refund after expiry.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                {item.step}
              </div>
              <h3 className="text-sm font-semibold">{item.title}</h3>
              <p className="mt-1 text-xs text-neutral-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
