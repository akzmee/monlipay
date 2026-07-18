"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { lightTheme, darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { ThemeProvider, useTheme } from "next-themes";
import { wagmiConfig } from "@/config/wagmi";
import { useState, useEffect, type ReactNode, useMemo } from "react";
import "@rainbow-me/rainbowkit/styles.css";

/** Pinned SSR theme to avoid hydration mismatch with next-themes; dark by default. */
const SSR_THEME = darkTheme({
  accentColor: "#8b73ff",
  accentColorForeground: "#fafaf9",
  borderRadius: "medium",
  overlayBlur: "small",
});

/**
 * Custom RainbowKit theme that matches the MonliPay brand colors.
 * Uses Monad's official electric violet (#6E54FF) brand color.
 */
function useRainbowKitTheme() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return useMemo(
    () =>
      isDark
        ? SSR_THEME
        : lightTheme({
            accentColor: "#6E54FF",
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
    <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitWrapper>{children}</RainbowKitWrapper>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
