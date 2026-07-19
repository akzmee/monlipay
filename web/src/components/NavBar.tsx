"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "./ConnectButton";
import { ThemeToggle } from "./ThemeToggle";
import { MonadLogo } from "./MonadLogo";
import { NetworkSwitcherModal } from "./NetworkSwitcherModal";
import { isMainnet } from "@/config/chain";

const navLinks = [
  { href: "/create", label: "Create" },
  { href: "/bridge", label: "Bridge" },
  { href: "/my-links", label: "My Links" },
];

export function NavBar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Lock body scroll when menu open
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [menuOpen]);

  const currentNetworkLabel = isMainnet ? "Mainnet" : "Testnet";

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-stone-200 bg-stone-50/80 backdrop-blur-md dark:border-stone-800 dark:bg-stone-950/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4">
          {/* Left: Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <MonadLogo variant="mark" size={28} priority />
            <span className="text-lg font-bold tracking-tight">
              <span className="logo-mark">Monli</span>
              <span className="text-stone-900 dark:text-stone-100">Pay</span>
            </span>
          </Link>

          {/* Center: Desktop nav links */}
          <nav className="hidden sm:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Right: Actions — wallet always visible, hamburger only on mobile */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <ConnectButton />
            {/* Hamburger — mobile only */}
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              className="sm:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 transition-colors hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-stone-800"
            >
              {menuOpen ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu — rendered OUTSIDE header to escape stacking context */}
      {menuOpen && (
        <div
          className="sm:hidden fixed inset-0 top-14 z-[60] overflow-y-auto bg-stone-50 dark:bg-stone-950"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="flex flex-col gap-1 px-4 py-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Nav links */}
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-xl px-4 py-3 text-base font-medium transition-colors ${
                    isActive
                      ? "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                      : "text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}

            {/* Divider */}
            <div className="my-2 border-t border-stone-200 dark:border-stone-800" />

            {/* Network switcher */}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setShowNetworkModal(true);
              }}
              className="flex items-center justify-between rounded-xl px-4 py-3 text-base font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                Monad {currentNetworkLabel}
              </span>
              <svg className="h-4 w-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>

            {/* Theme toggle */}
            <div className="flex items-center justify-between rounded-xl px-4 py-3 text-base font-medium text-stone-700 dark:text-stone-300">
              <span>Theme</span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}

      <NetworkSwitcherModal
        open={showNetworkModal}
        onClose={() => setShowNetworkModal(false)}
      />
    </>
  );
}
