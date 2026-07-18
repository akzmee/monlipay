"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { downloadQrPng, downloadQrSvg } from "@/lib/qr-download";

interface QRPreviewModalProps {
  open: boolean;
  onClose: () => void;
  /** The URL the QR code should encode (the claim URL with #fragment). */
  url: string;
}

/**
 * Modal that previews a QR code for a payment link and lets the user
 * download it as PNG or SVG. Used by the my-links page so a previously
 * created link can be re-shared via QR without re-entering the create flow.
 *
 * Style mirrors NetworkSwitcherModal / TokenSelectModal so all dialogs in
 * the app feel consistent: centered card, backdrop blur, escape / outside
 * click to close, body scroll lock.
 */
export function QRPreviewModal({ open, onClose, url }: QRPreviewModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const qrSourceRef = useRef<HTMLDivElement>(null);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    const t = setTimeout(() => closeButtonRef.current?.focus(), 80);
    return () => {
      window.removeEventListener("keydown", handler);
      clearTimeout(t);
    };
  }, [open, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function handlePng() {
    const canvas = qrSourceRef.current?.querySelector("canvas") ?? null;
    downloadQrPng(canvas);
  }

  function handleSvg() {
    const svgEl = qrSourceRef.current?.querySelector("svg") ?? null;
    downloadQrSvg(svgEl);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          // See NetworkSwitcherModal.tsx for the full rationale: we use
          // `h-[100dvh]` instead of `inset-0` so the modal centers within
          // the *visible* viewport on mobile (Android Chrome address bar).
          className="fixed inset-x-0 top-0 z-[100] flex h-[100dvh] items-center justify-center bg-black/60 backdrop-blur-md"
          style={{
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
          aria-label="QR code"
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
                Payment QR code
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

            {/* Body */}
            <div className="p-5">
              {/* QR preview — the visible SVG. The hidden canvas is only
                  there as a source for the PNG export (canvas → toDataURL). */}
              <div className="flex flex-col items-center gap-4">
                <div
                  ref={qrSourceRef}
                  className="rounded-2xl bg-white p-4 shadow-sm"
                  aria-label={`QR code for ${url}`}
                >
                  <QRCodeSVG
                    value={url}
                    size={220}
                    level="M"
                    fgColor="#0c0a09"
                    bgColor="#ffffff"
                    marginSize={1}
                  />
                  {/* Hidden canvas — only used for PNG export. */}
                  <div className="hidden" aria-hidden="true">
                    <QRCodeCanvas
                      value={url}
                      size={256}
                      level="M"
                      fgColor="#0c0a09"
                      bgColor="#ffffff"
                      marginSize={1}
                    />
                  </div>
                </div>

                {/* Truncated URL hint */}
                <p className="w-full break-all text-center text-xs text-stone-500 dark:text-stone-400">
                  <span className="font-medium text-stone-700 dark:text-stone-300">
                    Scans to:
                  </span>{" "}
                  {url}
                </p>

                {/* Download buttons */}
                <div className="flex w-full gap-2">
                  <button
                    type="button"
                    onClick={handlePng}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:from-violet-500 hover:to-indigo-500"
                  >
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
                        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                      />
                    </svg>
                    PNG
                  </button>
                  <button
                    type="button"
                    onClick={handleSvg}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
                  >
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
                        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                      />
                    </svg>
                    SVG
                  </button>
                </div>
                <p className="text-center text-[11px] text-stone-400 dark:text-stone-500">
                  Scan to claim · SVG is best for printing
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
