import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

// Mock wagmi
vi.mock("wagmi", () => ({
  WagmiProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="wagmi-provider">{children}</div>
  ),
}));

// Mock tanstack/react-query
vi.mock("@tanstack/react-query", () => ({
  QueryClient: class MockQueryClient {
    constructor() {}
  },
  QueryClientProvider: ({
    children,
  }: {
    children: ReactNode;
  }) => <div data-testid="query-provider">{children}</div>,
}));

// Mock RainbowKit
vi.mock("@rainbow-me/rainbowkit", () => ({
  RainbowKitProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="rainbowkit-provider">{children}</div>
  ),
  lightTheme: () => ({}),
  darkTheme: () => ({}),
}));

// Mock next-themes
vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="theme-provider">{children}</div>
  ),
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

// Mock wagmi config
vi.mock("@/config/wagmi", () => ({
  wagmiConfig: {},
}));

// Mock the RainbowKit CSS import to avoid issues in test environment
vi.mock("@rainbow-me/rainbowkit/styles.css", () => ({}));

import { Providers } from "@/components/Providers";

describe("Providers", () => {
  it("should render children", () => {
    render(
      <Providers>
        <div data-testid="child">Test Child</div>
      </Providers>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("should wrap children in WagmiProvider", () => {
    render(
      <Providers>
        <div>Test</div>
      </Providers>,
    );
    expect(screen.getByTestId("wagmi-provider")).toBeInTheDocument();
  });

  it("should wrap children in QueryClientProvider", () => {
    render(
      <Providers>
        <div>Test</div>
      </Providers>,
    );
    expect(screen.getByTestId("query-provider")).toBeInTheDocument();
  });

  it("should wrap children in RainbowKitProvider", () => {
    render(
      <Providers>
        <div>Test</div>
      </Providers>,
    );
    expect(screen.getByTestId("rainbowkit-provider")).toBeInTheDocument();
  });

  it("should wrap children in ThemeProvider (next-themes)", () => {
    render(
      <Providers>
        <div>Test</div>
      </Providers>,
    );
    expect(screen.getByTestId("theme-provider")).toBeInTheDocument();
  });
});
