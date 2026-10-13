import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { NavBar } from "@/components/NavBar";

const geistSans = localFont({
  src: "./fonts/geist-Geist[wght].ttf",
  variable: "--font-geist-sans",
  display: "swap",
});
const geistMono = localFont({
  src: "./fonts/geistmono-GeistMono[wght].ttf",
  variable: "--font-geist-mono",
  display: "swap",
});
const displayFont = localFont({
  src: "./fonts/chakrapetch-ChakraPetch-SemiBold.ttf",
  weight: "600",
  variable: "--font-chakra",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MonliPay | Send tokens with a link",
  description:
    "Create a payment link and send MON or tokens through any chat. Send to one person, or choose a group payment link to share with a group on Monad.",
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
      className={`${geistSans.variable} ${geistMono.variable} ${displayFont.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <NavBar />
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
