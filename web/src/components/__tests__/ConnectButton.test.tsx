import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

/**
 * Mock RainbowKit's ConnectButton.Custom.
 *
 * The real ConnectButton.Custom uses a render-prop pattern. We simulate it
 * by calling the children function with mock data that matches RainbowKit's
 * API: { account, chain, openAccountModal, openChainModal, openConnectModal, mounted }.
 */
const mockOpenConnectModal = vi.fn();
const mockOpenAccountModal = vi.fn();
const mockOpenChainModal = vi.fn();

let mockRenderProps: {
  account: { address: `0x${string}`; displayName: string } | null;
  chain: { id: number; name: string } | null;
  mounted: boolean;
} = {
  account: null,
  chain: null,
  mounted: false,
};

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: {
    Custom: ({
      children,
    }: {
      children: (props: {
        account: { address: `0x${string}`; displayName: string } | null;
        chain: { id: number; name: string } | null;
        openAccountModal: () => void;
        openChainModal: () => void;
        openConnectModal: () => void;
        mounted: boolean;
      }) => ReactNode;
    }) =>
      children({
        account: mockRenderProps.account,
        chain: mockRenderProps.chain,
        openAccountModal: mockOpenAccountModal,
        openChainModal: mockOpenChainModal,
        openConnectModal: mockOpenConnectModal,
        mounted: mockRenderProps.mounted,
      }),
  },
}));

// Mock window.location so we can assert redirects without jsdom navigation
// warnings. We only need href assignment to be observable; we don't actually
// want the test runner to navigate.
const originalLocation = window.location;
beforeEach(() => {
  // @ts-expect-error — jsdom allows delete + reassignment
  delete window.location;
  window.location = {
    ...originalLocation,
    hostname: "localhost",
    href: "http://localhost/",
  } as typeof window.location;
});
afterEach(() => {
  window.location = originalLocation;
});

// Import after mock
import { ConnectButton } from "@/components/ConnectButton";

const MONAD_TESTNET = { id: 10143, name: "Monad Testnet" };
const ETH_MAINNET = { id: 1, name: "Ethereum" };
const TEST_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;

describe("ConnectButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRenderProps = {
      account: null,
      chain: null,
      mounted: false,
    };
  });

  describe("when not mounted (SSR / hydration)", () => {
    it("should hide the button container (aria-hidden + opacity 0)", () => {
      mockRenderProps.mounted = false;
      render(<ConnectButton />);
      const container = screen.getByText("Connect Wallet").parentElement!;
      expect(container).toHaveAttribute("aria-hidden", "true");
      expect(container.style.opacity).toBe("0");
    });
  });

  describe("when disconnected", () => {
    beforeEach(() => {
      mockRenderProps.mounted = true;
      mockRenderProps.account = null;
      mockRenderProps.chain = null;
    });

    it("should render Connect Wallet button", () => {
      render(<ConnectButton />);
      expect(screen.getByText("Connect Wallet")).toBeInTheDocument();
    });

    it("should call openConnectModal when Connect Wallet is clicked", () => {
      render(<ConnectButton />);
      fireEvent.click(screen.getByText("Connect Wallet"));
      expect(mockOpenConnectModal).toHaveBeenCalledTimes(1);
    });

    it("should render green dot online indicator (chain pill stays visible)", () => {
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-emerald-500");
      expect(indicator).toBeInTheDocument();
    });

    it("should NOT call openConnectModal when the online indicator is clicked (it opens the network menu instead)", () => {
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-emerald-500");
      fireEvent.click(indicator!.closest("button")!);
      expect(mockOpenConnectModal).not.toHaveBeenCalled();
    });

    it("should open the network switcher dropdown when online indicator is clicked", () => {
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-emerald-500");
      fireEvent.click(indicator!.closest("button")!);
      // Dropdown should be visible with both networks listed.
      expect(screen.getByRole("menu", { name: /switch network/i })).toBeInTheDocument();
      // Active network is whichever isMainnet resolves to under test env.
      // Default config in tests is testnet (NEXT_PUBLIC_NETWORK not set).
      expect(screen.getByText(/Monad Testnet/)).toBeInTheDocument();
      expect(screen.getByText(/Monad Mainnet/)).toBeInTheDocument();
    });

    it("should expose 'online' aria-label on the indicator", () => {
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-emerald-500");
      const btn = indicator!.closest("button");
      expect(btn?.getAttribute("aria-label")).toMatch(/online/i);
    });

    it("should set aria-expanded on the indicator based on dropdown state", () => {
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-emerald-500");
      const btn = indicator!.closest("button")!;
      expect(btn.getAttribute("aria-expanded")).toBe("false");
      fireEvent.click(btn);
      expect(btn.getAttribute("aria-expanded")).toBe("true");
    });

    it("should not be aria-hidden when mounted", () => {
      render(<ConnectButton />);
      const container = screen.getByText("Connect Wallet").parentElement!;
      expect(container).not.toHaveAttribute("aria-hidden");
    });
  });

  describe("when connected on correct chain (Monad Testnet)", () => {
    beforeEach(() => {
      mockRenderProps.mounted = true;
      mockRenderProps.account = {
        address: TEST_ADDRESS,
        displayName: "0x1234...5678",
      };
      mockRenderProps.chain = MONAD_TESTNET;
    });

    it("should display truncated address", () => {
      render(<ConnectButton />);
      expect(screen.getByText("0x1234...5678")).toBeInTheDocument();
    });

    it("should show green dot indicator (no chain name text)", () => {
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-emerald-500");
      expect(indicator).toBeInTheDocument();
      // Chain name text should NOT be visible as standalone text in the
      // button (only in title/aria and inside the dropdown when opened).
      expect(screen.queryByText("Monad Testnet")).not.toBeInTheDocument();
    });

    it("should call openAccountModal when address button is clicked", () => {
      render(<ConnectButton />);
      fireEvent.click(screen.getByText("0x1234...5678"));
      expect(mockOpenAccountModal).toHaveBeenCalledTimes(1);
    });

    it("should open network switcher dropdown when chain dot indicator is clicked (not openChainModal)", () => {
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-emerald-500");
      fireEvent.click(indicator!.closest("button")!);
      expect(mockOpenChainModal).not.toHaveBeenCalled();
      expect(screen.getByRole("menu", { name: /switch network/i })).toBeInTheDocument();
    });

    it("should have title attribute with chain name for tooltip", () => {
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-emerald-500");
      const chainButton = indicator!.closest("button");
      expect(chainButton?.getAttribute("title")).toBe("Monad Testnet");
    });

    it("should not show Wrong Network", () => {
      render(<ConnectButton />);
      expect(screen.queryByText("Wrong Network")).not.toBeInTheDocument();
    });

    it("should highlight the active network in the dropdown with 'Active' label", () => {
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-emerald-500");
      fireEvent.click(indicator!.closest("button")!);
      // Testnet is active by default in tests.
      const activeRow = screen.getByText("Active").closest("button");
      expect(activeRow).toHaveTextContent("Monad Testnet");
      expect(activeRow).toHaveAttribute("aria-checked", "true");
    });

    it("should mark the other network with 'Switch →' label and aria-checked false", () => {
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-emerald-500");
      fireEvent.click(indicator!.closest("button")!);
      const switchRow = screen.getByText(/Switch →/).closest("button");
      expect(switchRow).toHaveTextContent("Monad Mainnet");
      expect(switchRow).toHaveAttribute("aria-checked", "false");
    });
  });

  describe("network switcher redirect behavior", () => {
    beforeEach(() => {
      mockRenderProps.mounted = true;
      mockRenderProps.account = null;
      mockRenderProps.chain = null;
    });

    it("should NOT redirect when running on localhost (dev mode)", () => {
      window.location.hostname = "localhost";
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-emerald-500");
      fireEvent.click(indicator!.closest("button")!);
      // Click the other network (Mainnet, since default is testnet).
      fireEvent.click(screen.getByText("Monad Mainnet"));
      // href should NOT have changed.
      expect(window.location.href).toBe("http://localhost/");
    });

    it("should show dev-mode notice in dropdown when on localhost", () => {
      window.location.hostname = "127.0.0.1";
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-emerald-500");
      fireEvent.click(indicator!.closest("button")!);
      expect(screen.getByText(/dev mode/i)).toBeInTheDocument();
    });

    it("should redirect when clicking the other network on a production origin", () => {
      window.location.hostname = "testnet.monlipay.xyz";
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-emerald-500");
      fireEvent.click(indicator!.closest("button")!);
      fireEvent.click(screen.getByText("Monad Mainnet"));
      expect(window.location.href).toBe("https://monlipay.xyz");
    });

    it("should NOT redirect when clicking the currently active network", () => {
      window.location.hostname = "testnet.monlipay.xyz";
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-emerald-500");
      fireEvent.click(indicator!.closest("button")!);
      // Clicking the active row (Testnet) should be a no-op.
      fireEvent.click(screen.getByText("Monad Testnet"));
      expect(window.location.href).not.toContain("monlipay.xyz");
    });
  });

  describe("dropdown dismissal", () => {
    beforeEach(() => {
      mockRenderProps.mounted = true;
      mockRenderProps.account = null;
      mockRenderProps.chain = null;
    });

    it("should close the dropdown when clicking the indicator again (toggle)", () => {
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-emerald-500");
      const btn = indicator!.closest("button")!;

      fireEvent.click(btn);
      expect(screen.getByRole("menu", { name: /switch network/i })).toBeInTheDocument();

      fireEvent.click(btn);
      expect(screen.queryByRole("menu", { name: /switch network/i })).not.toBeInTheDocument();
    });

    it("should close the dropdown on Escape key", () => {
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-emerald-500");
      fireEvent.click(indicator!.closest("button")!);
      expect(screen.getByRole("menu", { name: /switch network/i })).toBeInTheDocument();

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("menu", { name: /switch network/i })).not.toBeInTheDocument();
    });

    it("should close the dropdown when clicking outside", () => {
      const { container } = render(
        <div>
          <ConnectButton />
          <div data-testid="outside">outside</div>
        </div>,
      );
      const indicator = container.querySelector(".bg-emerald-500");
      fireEvent.click(indicator!.closest("button")!);
      expect(screen.getByRole("menu", { name: /switch network/i })).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByTestId("outside"));
      expect(screen.queryByRole("menu", { name: /switch network/i })).not.toBeInTheDocument();
    });
  });

  describe("when connected on wrong chain", () => {
    beforeEach(() => {
      mockRenderProps.mounted = true;
      mockRenderProps.account = {
        address: TEST_ADDRESS,
        displayName: "0x1234...5678",
      };
      mockRenderProps.chain = ETH_MAINNET;
    });

    it("should show Wrong Network button", () => {
      render(<ConnectButton />);
      expect(screen.getByText("Wrong Network")).toBeInTheDocument();
    });

    it("should show amber pulse indicator", () => {
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-amber-500");
      expect(indicator).toBeInTheDocument();
    });

    it("should call openChainModal when Wrong Network is clicked (still uses wallet modal, not network switcher)", () => {
      render(<ConnectButton />);
      fireEvent.click(screen.getByText("Wrong Network"));
      expect(mockOpenChainModal).toHaveBeenCalledTimes(1);
    });

    it("should not show the address", () => {
      render(<ConnectButton />);
      expect(screen.queryByText("0x1234...5678")).not.toBeInTheDocument();
    });
  });
});
