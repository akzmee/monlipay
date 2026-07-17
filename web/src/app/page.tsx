"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { Scene3D } from "@/components/Scene3D";
import { isContractDeployed } from "@/config/chain";

/**
 * Landing page — marketing hero with 3D background.
 *
 * The actual create-payment-link flow lives at /create.
 */
export default function HomePage() {
  const { isConnected } = useAccount();

  return (
    <div className="relative overflow-hidden">
      {/* 3D background */}
      <Scene3D />

      <div className="mx-auto max-w-4xl px-4 py-20 sm:py-28">
        {/* Hero */}
        <div className="text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/70 px-3 py-1 text-xs font-medium text-stone-700 backdrop-blur dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live on Monad
          </div>

          {/* Headline */}
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-stone-900 dark:text-stone-50 sm:text-5xl md:text-6xl">
            Send any token
            <br />
            <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent dark:from-violet-400 dark:to-indigo-400">
              via a link
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mb-8 max-w-xl text-base text-stone-600 dark:text-stone-400 sm:text-lg">
            MonliPay lets you send tokens on Monad as easily as sharing a
            WhatsApp link. Recipient claims with one tap. Unclaimed funds
            refund automatically.
          </p>

          {/* CTAs */}
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            {!isContractDeployed ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                Contract not deployed. Set address in <code>.env.local</code>.
              </div>
            ) : (
              <Link
                href="/create"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-lg shadow-violet-500/20 transition-all hover:from-violet-500 hover:to-indigo-500 hover:shadow-violet-500/30 active:scale-95 sm:w-auto"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
                Create a payment link
              </Link>
            )}

            <Link
              href="/bridge"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white/70 px-6 py-3 text-base font-semibold text-stone-800 backdrop-blur transition-all hover:bg-white hover:shadow-md dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-200 dark:hover:bg-stone-900 sm:w-auto"
            >
              Bridge to Monad
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                />
              </svg>
            </Link>
          </div>

          {/* Wallet hint */}
          {!isConnected && isContractDeployed && (
            <p className="mt-6 text-xs text-stone-500 dark:text-stone-500">
              You&apos;ll need to connect a wallet on the next page.
            </p>
          )}
        </div>

        {/* Feature cards */}
        <div className="mt-20 grid gap-6 sm:grid-cols-3">
          {/* Feature 1 */}
          <div className="rounded-2xl border border-stone-200 bg-white/70 p-6 backdrop-blur transition-shadow hover:shadow-md dark:border-stone-800 dark:bg-stone-900/70">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
            </div>
            <h3 className="mb-2 text-base font-semibold text-stone-900 dark:text-stone-100">
              One-tap claim
            </h3>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Recipient doesn&apos;t need an account. They click the link,
              connect a wallet, and the tokens land instantly.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="rounded-2xl border border-stone-200 bg-white/70 p-6 backdrop-blur transition-shadow hover:shadow-md dark:border-stone-800 dark:bg-stone-900/70">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h3 className="mb-2 text-base font-semibold text-stone-900 dark:text-stone-100">
              Auto-refund
            </h3>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Set an expiry on every link. If no one claims in time, the
              funds return to you automatically. No support tickets.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="rounded-2xl border border-stone-200 bg-white/70 p-6 backdrop-blur transition-shadow hover:shadow-md dark:border-stone-800 dark:bg-stone-900/70">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
            </div>
            <h3 className="mb-2 text-base font-semibold text-stone-900 dark:text-stone-100">
              Any ERC-20
            </h3>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              Send MON, USDC, WETH, WMON, or import any contract address.
              Recipient gets the same token you sent.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-20">
          <h2 className="mb-8 text-center text-2xl font-bold text-stone-900 dark:text-stone-100 sm:text-3xl">
            How it works
          </h2>
          <div className="grid gap-8 sm:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">
                1
              </div>
              <h4 className="mb-1 font-semibold text-stone-900 dark:text-stone-100">
                Create a link
              </h4>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Pick a token, amount, and expiry. Sign one transaction.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500 text-sm font-bold text-white">
                2
              </div>
              <h4 className="mb-1 font-semibold text-stone-900 dark:text-stone-100">
                Share it anywhere
              </h4>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                WhatsApp, Telegram, email, QR code — whatever works.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500 text-sm font-bold text-white">
                3
              </div>
              <h4 className="mb-1 font-semibold text-stone-900 dark:text-stone-100">
                Recipient claims
              </h4>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                They tap the link, connect a wallet, and tokens arrive.
              </p>
            </div>
          </div>
        </div>

        {/* Final CTA */}
        <div className="mt-20 text-center">
          <Link
            href="/create"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-violet-500/20 transition-all hover:from-violet-500 hover:to-indigo-500 hover:shadow-violet-500/30 active:scale-95"
          >
            Get started
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          <p className="mt-3 text-xs text-stone-500">
            Free to use · No signup · Self-custodial
          </p>
        </div>
      </div>
    </div>
  );
}
