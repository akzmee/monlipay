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

    it("should call openConnectModal when clicked", () => {
      render(<ConnectButton />);
      fireEvent.click(screen.getByText("Connect Wallet"));
      expect(mockOpenConnectModal).toHaveBeenCalledTimes(1);
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

    it("should show chain name with green indicator", () => {
      const { container } = render(<ConnectButton />);
      const indicator = container.querySelector(".bg-green-500");
      expect(indicator).toBeInTheDocument();
      expect(screen.getByText("Monad Testnet")).toBeInTheDocument();
    });

    it("should call openAccountModal when address button is clicked", () => {
      render(<ConnectButton />);
      fireEvent.click(screen.getByText("0x1234...5678"));
      expect(mockOpenAccountModal).toHaveBeenCalledTimes(1);
    });

    it("should call openChainModal when chain button is clicked", () => {
      render(<ConnectButton />);
      fireEvent.click(screen.getByText("Monad Testnet"));
      expect(mockOpenChainModal).toHaveBeenCalledTimes(1);
    });

    it("should not show Wrong Network", () => {
      render(<ConnectButton />);
      expect(screen.queryByText("Wrong Network")).not.toBeInTheDocument();
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

    it("should call openChainModal when Wrong Network is clicked", () => {
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
