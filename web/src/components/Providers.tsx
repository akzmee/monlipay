"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { lightTheme, darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { ThemeProvider, useTheme } from "next-themes";
import { wagmiConfig } from "@/config/wagmi";
import { useState, type ReactNode, useMemo } from "react";
import "@rainbow-me/rainbowkit/styles.css";

/**
 * Custom RainbowKit theme that matches the MonliPay brand colors.
 * Uses red-to-orange gradient accents instead of RainbowKit's default blue.
 */
function useRainbowKitTheme() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return useMemo(
    () =>
      isDark
        ? darkTheme({
            accentColor: "#ef4444",
            accentColorForeground: "#fafaf9",
            borderRadius: "medium",
            overlayBlur: "small",
          })
        : lightTheme({
            accentColor: "#dc2626",
            accentColorForeground: "#fafaf9",
            borderRadius: "medium",
            overlayBlur: "small",
          }),
    [isDark],
  );
}

function RainbowKitWrapper({ children }: { children: ReactNode }) {
  const rkTheme = useRainbowKitTheme();
  return (
    <RainbowKitProvider theme={rkTheme} modalSize="compact">
      {children}
    </RainbowKitProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitWrapper>{children}</RainbowKitWrapper>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
