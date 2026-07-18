import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { NavBar } from "@/components/NavBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MonliPay — Send any token via link on Monad",
  description:
    "Send tokens on Monad as easily as sharing a WhatsApp link. Recipient clicks, funds arrive. Unclaimed? Refund anytime.",
};

/**
 * viewport-fit=cover enables env(safe-area-inset-*) on iOS so that
 * fixed-position elements (modals, bottom sheets, the navbar) can pad
 * themselves away from the notch / home indicator / dynamic address bar.
 * Without this, env(safe-area-inset-*) always resolves to 0.
 */
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-white text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        <Providers>
          <NavBar />
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
