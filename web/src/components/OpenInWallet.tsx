"use client";

import { useState, useEffect } from "react";
import { needsWalletBrowser, getMetaMaskDeepLink } from "@/lib/wallet";

/**
 * Shows a banner prompting mobile users to open the dApp inside their
 * wallet's built-in browser (MetaMask). Without this, they can't sign
 * transactions because there's no injected provider in Safari/Chrome.
 */
export function OpenInWallet() {
  const [show, setShow] = useState(false);
  const [deepLink, setDeepLink] = useState("");

  useEffect(() => {
    if (needsWalletBrowser()) {
      setShow(true);
      setDeepLink(getMetaMaskDeepLink());
    }
  }, []);

  if (!show) return null;

  return (
    <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
          {/* MetaMask fox icon (simplified) */}
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 5L14 10.5L21 5ZM21 5L13.5 6.5L10.5 3.5L21 5Z"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-blue-600 dark:text-blue-400"
            />
            <path
              d="M3 5L10 10.5L3 5ZM3 5L10.5 6.5L13.5 3.5L3 5Z"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-blue-600 dark:text-blue-400"
            />
            <circle cx="12" cy="14" r="6" stroke="currentColor" strokeWidth={1.5} className="text-blue-600 dark:text-blue-400" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            Open in MetaMask to claim
          </h3>
          <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">
            You need a crypto wallet to claim. Tap below to open this page in MetaMask.
          </p>
          <a
            href={deepLink}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 active:scale-[0.98] dark:bg-blue-700 dark:hover:bg-blue-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Open in MetaMask
          </a>
        </div>
      </div>
    </div>
  );
}
