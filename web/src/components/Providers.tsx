"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider as PrivyWagmiProvider } from "@privy-io/wagmi";
import {
  lightTheme,
  darkTheme,
  RainbowKitProvider,
} from "@rainbow-me/rainbowkit";
import { ThemeProvider, useTheme } from "next-themes";
import { wagmiConfig } from "@/config/wagmi";
import { LinkBackupProvider } from "./LinkBackupProvider";
import { PrivyWalletEntry } from "./PrivyWalletEntry";
import { PRIVY_APP_ID } from "@/config/privy";
import { monadChain } from "@/config/chain";
import { useState, useSyncExternalStore, type ReactNode, useMemo } from "react";
import "@rainbow-me/rainbowkit/styles.css";

/** Pinned SSR theme to avoid hydration mismatch with next-themes; dark by default. */
const SSR_THEME = darkTheme({
  accentColor: "#8b73ff",
  accentColorForeground: "#fafaf9",
  borderRadius: "medium",
  overlayBlur: "small",
});

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function useRainbowKitTheme() {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const isDark = !mounted || resolvedTheme !== "light";

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

function WalletProviders({ children, queryClient }: { children: ReactNode; queryClient: QueryClient }) {
  const { resolvedTheme } = useTheme();
  const content = <LinkBackupProvider>{children}</LinkBackupProvider>;
  if (!PRIVY_APP_ID) return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitWrapper>{content}</RainbowKitWrapper>
      </QueryClientProvider>
    </WagmiProvider>
  );
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={{
      defaultChain: monadChain,
      supportedChains: [monadChain],
      loginMethods: ["email", "wallet"],
      appearance: {
        theme: resolvedTheme === "light" ? "light" : "#101012",
        accentColor: "#8b73ff",
        logo: "/brand/monlipay-mark.svg",
        landingHeader: "Open MonliPay",
        loginMessage: "Use your email or connect a wallet to send and receive payments.",
        walletChainType: "ethereum-only",
      },
      embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: true },
    }}>
      <QueryClientProvider client={queryClient}>
        <PrivyWagmiProvider config={wagmiConfig}>
          <RainbowKitWrapper><PrivyWalletEntry>{content}</PrivyWalletEntry></RainbowKitWrapper>
        </PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
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
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
    >
      <WalletProviders queryClient={queryClient}>{children}</WalletProviders>
    </ThemeProvider>
  );
}
