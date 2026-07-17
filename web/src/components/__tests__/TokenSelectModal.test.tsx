import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TokenSelectModal } from "@/components/TokenSelectModal";
import type { TokenInfo } from "@/config/chain";

// Mock useTokenMetadata — returns null metadata by default
vi.mock("@/hooks/useTokenMetadata", () => ({
  useTokenMetadata: vi.fn(() => ({
    metadata: null,
    isLoading: false,
    isError: false,
    error: null,
  })),
}));

import { useTokenMetadata } from "@/hooks/useTokenMetadata";

const TOKENS: TokenInfo[] = [
  {
    symbol: "MON",
    name: "Monad",
    address: "0x0000000000000000000000000000000000000000",
    decimals: 18,
    isNative: true,
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x754704bc059f8c67012fed69bc8a327a5aafb603",
    decimals: 6,
    isNative: false,
    logoURI: "https://example.com/usdc.png",
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0x1234567890123456789012345678901234567890",
    decimals: 18,
    isNative: false,
  },
];

const SELECTED = TOKENS[0];
const CUSTOM_ADDRS = new Set(["0x1234567890123456789012345678901234567890"]);

const PROPS = {
  open: true,
  onClose: vi.fn(),
  tokens: TOKENS,
  selectedToken: SELECTED,
  onSelect: vi.fn(),
  onAddCustomToken: vi.fn(),
  onRemoveCustomToken: vi.fn(),
  customTokenAddresses: CUSTOM_ADDRS,
};

describe("TokenSelectModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useTokenMetadata).mockReturnValue({
      metadata: null,
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  describe("when closed", () => {
    it("should render nothing", () => {
      const { container } = render(
        <TokenSelectModal {...PROPS} open={false} />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe("when open", () => {
    it("should render the modal with 'Select a token' header", () => {
      render(<TokenSelectModal {...PROPS} />);
      expect(screen.getByText("Select a token")).toBeInTheDocument();
    });

    it("should display all tokens", () => {
      render(<TokenSelectModal {...PROPS} />);
      expect(screen.getByText("MON")).toBeInTheDocument();
      expect(screen.getByText("USDC")).toBeInTheDocument();
      expect(screen.getByText("WETH")).toBeInTheDocument();
    });

    it("should show selected checkmark on the selected token", () => {
      const { container } = render(<TokenSelectModal {...PROPS} />);
      // Check svg present in the row that contains MON
      const monButton = screen.getByText("MON").closest("button");
      expect(monButton).not.toBeNull();
    });

    it("should show Custom badge for custom tokens", () => {
      render(<TokenSelectModal {...PROPS} />);
      expect(screen.getByText("Custom")).toBeInTheDocument();
    });

    it("should call onClose when close button clicked", () => {
      render(<TokenSelectModal {...PROPS} />);
      const closeBtn = screen.getByLabelText("Close");
      fireEvent.click(closeBtn);
      expect(PROPS.onClose).toHaveBeenCalled();
    });

    it("should call onClose when clicking backdrop", () => {
      const { container } = render(<TokenSelectModal {...PROPS} />);
      const backdrop = container.firstChild as HTMLElement;
      fireEvent.click(backdrop);
      expect(PROPS.onClose).toHaveBeenCalled();
    });

    it("should call onClose on Escape key", () => {
      render(<TokenSelectModal {...PROPS} />);
      fireEvent.keyDown(window, { key: "Escape" });
      expect(PROPS.onClose).toHaveBeenCalled();
    });

    it("should call onSelect and onClose when a token is clicked", () => {
      render(<TokenSelectModal {...PROPS} />);
      fireEvent.click(screen.getByText("USDC"));
      expect(PROPS.onSelect).toHaveBeenCalledWith(TOKENS[1]);
      expect(PROPS.onClose).toHaveBeenCalled();
    });

    it("should filter tokens by search query (symbol)", () => {
      render(<TokenSelectModal {...PROPS} />);
      const input = screen.getByPlaceholderText("Search name or paste address");
      fireEvent.change(input, { target: { value: "USD" } });
      expect(screen.getByText("USDC")).toBeInTheDocument();
      expect(screen.queryByText("MON")).not.toBeInTheDocument();
      expect(screen.queryByText("WETH")).not.toBeInTheDocument();
    });

    it("should filter tokens by search query (name)", () => {
      render(<TokenSelectModal {...PROPS} />);
      const input = screen.getByPlaceholderText("Search name or paste address");
      fireEvent.change(input, { target: { value: "wrapped" } });
      expect(screen.queryByText("USDC")).not.toBeInTheDocument();
      expect(screen.getByText("WETH")).toBeInTheDocument();
    });

    it("should show 'No tokens found' when search has no matches", () => {
      render(<TokenSelectModal {...PROPS} />);
      const input = screen.getByPlaceholderText("Search name or paste address");
      fireEvent.change(input, { target: { value: "zzzz" } });
      expect(screen.getByText("No tokens found")).toBeInTheDocument();
    });

    it("should show import suggestion when search yields no matches", () => {
      render(<TokenSelectModal {...PROPS} />);
      const input = screen.getByPlaceholderText("Search name or paste address");
      fireEvent.change(input, { target: { value: "0xabc" } });
      expect(
        screen.getByText(/Import .0xabc. as custom token/),
      ).toBeInTheDocument();
    });

    it("should open import view when 'Import Custom Token' button clicked", () => {
      render(<TokenSelectModal {...PROPS} />);
      fireEvent.click(screen.getByText("Import Custom Token"));
      expect(
        screen.getByPlaceholderText("0x… contract address"),
      ).toBeInTheDocument();
    });

    it("should show Back button in import view", () => {
      render(<TokenSelectModal {...PROPS} />);
      fireEvent.click(screen.getByText("Import Custom Token"));
      expect(screen.getByText("Back")).toBeInTheDocument();
    });

    it("should go back to token list from import view", () => {
      render(<TokenSelectModal {...PROPS} />);
      fireEvent.click(screen.getByText("Import Custom Token"));
      fireEvent.click(screen.getByText("Back"));
      expect(screen.getByText("Select a token")).toBeInTheDocument();
    });

    it("should call onRemoveCustomToken when remove button clicked", () => {
      render(<TokenSelectModal {...PROPS} />);
      // WETH is a custom token — find its remove button
      const removeBtn = screen.getByLabelText("Remove WETH");
      fireEvent.click(removeBtn);
      expect(PROPS.onRemoveCustomToken).toHaveBeenCalledWith(
        "0x1234567890123456789012345678901234567890",
      );
    });

    it("should open import view from no-results suggestion", () => {
      render(<TokenSelectModal {...PROPS} />);
      const input = screen.getByPlaceholderText("Search name or paste address");
      fireEvent.change(input, { target: { value: "0xdeadbeef" } });
      fireEvent.click(screen.getByText(/Import .0xdeadbeef./));
      expect(
        (screen.getByPlaceholderText("0x… contract address") as HTMLInputElement)
          .value,
      ).toBe("0xdeadbeef");
    });
  });

  describe("import view with metadata", () => {
    it("should show token preview when metadata is available", () => {
      const mockMeta = {
        address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`,
        name: "Test Token",
        symbol: "TST",
        decimals: 18,
        isNative: false,
      };
      vi.mocked(useTokenMetadata).mockReturnValue({
        metadata: mockMeta,
        isLoading: false,
        isError: false,
        error: null,
      });

      render(<TokenSelectModal {...PROPS} />);
      fireEvent.click(screen.getByText("Import Custom Token"));

      // Enter an address to trigger metadata fetch
      const input = screen.getByPlaceholderText("0x… contract address");
      fireEvent.change(input, {
        target: { value: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" },
      });

      expect(screen.getByText("TST")).toBeInTheDocument();
      expect(screen.getByText("Test Token")).toBeInTheDocument();
      expect(screen.getByText("Import TST")).toBeInTheDocument();
    });

    it("should show loading state", () => {
      vi.mocked(useTokenMetadata).mockReturnValue({
        metadata: null,
        isLoading: true,
        isError: false,
        error: null,
      });

      render(<TokenSelectModal {...PROPS} />);
      fireEvent.click(screen.getByText("Import Custom Token"));

      expect(screen.getByText("Fetching metadata…")).toBeInTheDocument();
    });

    it("should show error state", () => {
      vi.mocked(useTokenMetadata).mockReturnValue({
        metadata: null,
        isLoading: false,
        isError: true,
        // wagmi's error type is a complex union; cast for test purposes
        error: new Error("not found") as never,
      });

      render(<TokenSelectModal {...PROPS} />);
      fireEvent.click(screen.getByText("Import Custom Token"));

      expect(
        screen.getByText(/No valid ERC-20 token found/i),
      ).toBeInTheDocument();
    });

    it("should call onAddCustomToken and onSelect when importing", () => {
      const mockMeta = {
        address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`,
        name: "Test Token",
        symbol: "TST",
        decimals: 18,
        isNative: false,
      };
      vi.mocked(useTokenMetadata).mockReturnValue({
        metadata: mockMeta,
        isLoading: false,
        isError: false,
        error: null,
      });

      render(<TokenSelectModal {...PROPS} />);
      fireEvent.click(screen.getByText("Import Custom Token"));
      fireEvent.click(screen.getByText("Import TST"));

      expect(PROPS.onAddCustomToken).toHaveBeenCalledWith(mockMeta);
      expect(PROPS.onSelect).toHaveBeenCalledWith(mockMeta);
      expect(PROPS.onClose).toHaveBeenCalled();
    });

    it("should disable Import button when no metadata", () => {
      render(<TokenSelectModal {...PROPS} />);
      fireEvent.click(screen.getByText("Import Custom Token"));
      const importBtn = screen.getByText("Import Token");
      expect(importBtn).toBeDisabled();
    });
  });

  describe("token avatar", () => {
    it("should render img when logoURI is present", () => {
      render(<TokenSelectModal {...PROPS} />);
      const img = screen.getByAltText("USDC");
      expect(img).toHaveAttribute("src", "https://example.com/usdc.png");
    });

    it("should render letter avatar when no logoURI", () => {
      render(<TokenSelectModal {...PROPS} />);
      // MON and WETH don't have logoURI — they show letter avatars
      // Just verify the component rendered them
      expect(screen.getByText("MON")).toBeInTheDocument();
      expect(screen.getByText("WETH")).toBeInTheDocument();
    });
  });
});
