"use client";

import { useState, useRef, useCallback } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { downloadQrPng, downloadQrSvg } from "@/lib/qr-download";

interface ShareLinkProps {
  url: string;
  onReset: () => void;
}

type ShareView = "link" | "qr";

export function ShareLink({ url, onReset }: ShareLinkProps) {
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<ShareView>("link");
  const qrCanvasRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Clipboard API not available — fallback to execCommand
      try {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } catch {
        // If even execCommand fails, user must copy manually
      }
    }
  };

  const handleShareWhatsApp = () => {
    const text = "You got MON! Click to claim:";
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text + " " + url)}`,
      "_blank",
    );
  };

  const handleShareTelegram = () => {
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent("You got MON! Click to claim:")}`,
      "_blank",
    );
  };

  /**
   * Download the QR code as a PNG image.
   *
   * We render QRCodeCanvas (hidden in DOM but accessible via ref) and let
   * the shared qr-download helper produce a 512×512 white-padded PNG so
   * it scans reliably when printed or shown on a phone screen.
   */
  const handleDownloadPng = useCallback(() => {
    const canvas = qrCanvasRef.current?.querySelector("canvas") ?? null;
    downloadQrPng(canvas);
  }, []);

  /**
   * Download the QR code as an SVG (vector format for print / scaling).
   * Delegates to the shared qr-download helper which clones the rendered
   * QRCodeSVG and wraps it in a standalone <svg> document.
   */
  const handleDownloadSvg = useCallback(() => {
    const svgEl = qrCanvasRef.current?.querySelector("svg") ?? null;
    downloadQrSvg(svgEl);
  }, []);

  return (
    <div className="space-y-6">
      {/* Success header */}
      <div className="text-center">
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
        <h1 className="text-2xl font-bold tracking-tight">Payment link created</h1>
        <p className="mt-1 text-sm text-stone-500">
          Share this link with the recipient. Funds are locked until they claim.
        </p>
      </div>

      {/* Link box */}
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-900">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Payment link
          </p>
          {/* Tab toggle: Link / QR */}
          <div
            role="tablist"
            aria-label="Share format"
            className="inline-flex items-center rounded-lg bg-stone-200 p-0.5 dark:bg-stone-800"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === "link"}
              onClick={() => setView("link")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                view === "link"
                  ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100"
                  : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
              }`}
            >
              Link
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "qr"}
              onClick={() => setView("qr")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                view === "qr"
                  ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100"
                  : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
              }`}
            >
              QR Code
            </button>
          </div>
        </div>

        {view === "link" ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-white px-3 py-2 text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-300">
              {url}
            </code>
            <button
              onClick={handleCopy}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                copied
                  ? "bg-green-600 text-white"
                  : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500"
              }`}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {/* QR preview + hidden source elements for download.
                The preview uses QRCodeSVG (crisp at any size, looks better
                on screen). The hidden QRCodeCanvas is only used by the PNG
                download handler. */}
            <div
              ref={qrCanvasRef}
              className="rounded-2xl bg-white p-4 shadow-sm"
              aria-label={`QR code for ${url}`}
            >
              <QRCodeSVG
                value={url}
                size={200}
                level="M"
                fgColor="#0c0a09"
                bgColor="#ffffff"
                marginSize={1}
              />
              {/* Hidden canvas — only exists for PNG export. */}
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

            {/* Download buttons */}
            <div className="flex w-full gap-2">
              <button
                type="button"
                onClick={handleDownloadPng}
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
                onClick={handleDownloadSvg}
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
        )}
      </div>

      {/* Share buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleShareWhatsApp}
          className="flex items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm font-medium transition-colors hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:hover:bg-stone-800"
        >
          <svg className="h-5 w-5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.264 8.264 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.183 8.183 0 0 1 2.42 5.83c.02 4.54-3.68 8.23-8.23 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43-.14 0-.31-.02-.47-.02-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z" />
          </svg>
          WhatsApp
        </button>
        <button
          onClick={handleShareTelegram}
          className="flex items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm font-medium transition-colors hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:hover:bg-stone-800"
        >
          <svg className="h-5 w-5 text-sky-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295l.213-3.053 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.643.135-.953l11.566-4.458c.538-.196 1.006.128.832.938z" />
          </svg>
          Telegram
        </button>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/30">
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
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
        <p className="text-xs text-amber-800 dark:text-amber-200">
          Anyone with this link can claim the funds. Share it privately with the
          intended recipient only.
        </p>
      </div>

      {/* Create another */}
      <button
        onClick={onReset}
        className="w-full rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm font-medium transition-colors hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:hover:bg-stone-800"
      >
        Create another link
      </button>
    </div>
  );
}
