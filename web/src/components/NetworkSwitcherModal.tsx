"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MonadLogo } from "./MonadLogo";
import { isMainnet } from "@/config/chain";

/**
 * Cross-domain network switcher URLs.
 *
 * Each deployment lives on its own subdomain and is built with a different
 * NEXT_PUBLIC_NETWORK env var, so "switching network" means redirecting to a
 * different origin. We hardcode the production URLs here because:
 *   1. They are stable for the foreseeable future (hackathon + early mainnet).
 *   2. Exposing them via NEXT_PUBLIC_* would add config ceremony without value.
 *
 * During local dev (localhost / 127.0.0.1) the modal opens but clicking the
 * "other" network just keeps you on the same origin — we don't want to bounce
 * a developer to production mid-debug.
 */
const NETWORK_URLS = {
  testnet: "https://testnet.monlipay.xyz",
  mainnet: "https://monlipay.xyz",
} as const;

/**
 * Returns true if the current page is running on a non-production origin
 * (localhost, 127.0.0.1, *.vercel.app, *.local). On those origins the modal
 * shows but does not redirect.
 */
function isDevOrigin(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".vercel.app") ||
    host.endsWith(".local")
  );
}

type NetworkKey = "testnet" | "mainnet";

interface NetworkOption {
  key: NetworkKey;
  label: string;
  description: string;
  url: string;
}

const NETWORKS: NetworkOption[] = [
  {
    key: "testnet",
    label: "Monad Testnet",
    description: "Chain 10143 • Testnet MON (no real value)",
    url: NETWORK_URLS.testnet,
  },
  {
    key: "mainnet",
    label: "Monad Mainnet",
    description: "Chain 143 • Real MON",
    url: NETWORK_URLS.mainnet,
  },
];

interface NetworkSwitcherModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Cross-domain network switcher modal.
 *
 * Each deployment of MonliPay is single-chain (configured at build time via
 * NEXT_PUBLIC_NETWORK), so "switching network" means redirecting to a
 * different subdomain rather than changing the active chain in the wallet.
 *
 * The modal lists both Testnet and Mainnet deployments, highlights the
 * current one, and redirects to the other on click. Style matches
 * TokenSelectModal (backdrop blur + slide-up sheet on mobile, centered card
 * on desktop, escape / outside-click to close).
 */
export function NetworkSwitcherModal({ open, onClose }: NetworkSwitcherModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    // Focus the close button for keyboard users.
    const t = setTimeout(() => closeButtonRef.current?.focus(), 80);
    return () => {
      window.removeEventListener("keydown", handler);
      clearTimeout(t);
    };
  }, [open, onClose]);

  // Lock body scroll while modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function handleSelect(target: NetworkKey) {
    onClose();
    if (target === (isMainnet ? "mainnet" : "testnet")) {
      return;
    }
    if (isDevOrigin()) {
      console.info(
        `[network] Would redirect to ${target} (${NETWORK_URLS[target]}) in production.`,
      );
      return;
    }
    window.location.href = NETWORK_URLS[target];
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md"
          style={{
            // Respect mobile browser chrome (address bar, notch, home
            // indicator). Without these paddings the centered modal can
            // slide under the address bar — making the close button and
            // header unreachable. `env(safe-area-inset-*)` resolves to 0
            // on desktop and on browsers without viewport-fit=cover.
            //
            // The max() wrapper lets us keep a 16px floor — env values can
            // be smaller on devices with a small home indicator.
            paddingTop: "max(env(safe-area-inset-top), 1rem)",
            paddingBottom: "max(env(safe-area-inset-bottom), 1rem)",
            paddingLeft: "max(env(safe-area-inset-left), 1rem)",
            paddingRight: "max(env(safe-area-inset-right), 1rem)",
          }}
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          role="dialog"
          aria-modal="true"
          aria-label="Switch network"
        >
          <motion.div
            className="flex w-full max-w-md max-h-[85dvh] flex-col overflow-y-auto rounded-3xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 8, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 8, opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3.5 dark:border-stone-700">
              <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
                Switch Network
              </h2>
              <button
                ref={closeButtonRef}
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
                aria-label="Close"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Network list */}
            <div className="p-3">
              <motion.div
                initial="hidden"
                animate="visible"
                variants={{
                  visible: { transition: { staggerChildren: 0.04 } },
                }}
              >
                {NETWORKS.map((network) => {
                  const isActive =
                    (network.key === "mainnet") === isMainnet;
                  return (
                    <motion.button
                      key={network.key}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => handleSelect(network.key)}
                      variants={{
                        hidden: { opacity: 0, y: 4 },
                        visible: { opacity: 1, y: 0 },
                      }}
                      className={`group flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all active:scale-[0.98] ${
                        isActive
                          ? "border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/30"
                          : "border-transparent hover:border-stone-200 hover:bg-stone-50 dark:hover:border-stone-700 dark:hover:bg-stone-800"
                      }`}
                    >
                      {/* Logo container */}
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors ${
                          isActive
                            ? "border-violet-400 bg-white dark:border-violet-600 dark:bg-stone-900"
                            : "border-stone-200 bg-stone-100 dark:border-stone-700 dark:bg-stone-800"
                        }`}
                      >
                        <MonadLogo variant="mark" size={26} />
                      </div>

                      {/* Labels */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-stone-900 dark:text-stone-100">
                            {network.label}
                          </span>
                          {isActive && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
                          {network.description}
                        </p>
                      </div>

                      {/* Trailing indicator */}
                      {isActive ? (
                        <svg
                          className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4.5 12.75l6 6 9-13.5"
                          />
                        </svg>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400">
                          Switch
                          <svg
                            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                            />
                          </svg>
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </motion.div>

              {/* Dev-mode notice */}
              {isDevOrigin() && (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                  Dev mode: redirect is disabled on{" "}
                  <code className="font-mono">localhost</code>. Clicking
                  another network will only log the target URL.
                </p>
              )}

              {/* Help text */}
              <p className="mt-3 text-center text-[11px] text-stone-400 dark:text-stone-500">
                Each network runs on its own domain. Switching will redirect
                you.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
