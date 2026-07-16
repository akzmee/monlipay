import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ClaimForm } from "@/components/ClaimForm";

const mockAddress = "0x1234567890123456789012345678901234567890" as `0x${string}`;

function renderClaimForm(overrides: Partial<Parameters<typeof ClaimForm>[0]> = {}) {
  const props = {
    isConnected: true,
    isBusy: false,
    isWrongChain: false,
    error: null,
    address: mockAddress,
    recipientOverride: "",
    setRecipientOverride: vi.fn(),
    recipientError: null,
    onClaim: vi.fn(),
    ...overrides,
  };
  return { ...render(<ClaimForm {...props} />), props };
}

describe("ClaimForm", () => {
  describe("when not connected", () => {
    it("should show connect wallet prompt", () => {
      renderClaimForm({ isConnected: false, address: undefined });
      expect(screen.getByText("Connect wallet to claim")).toBeInTheDocument();
    });

    it("should show instruction text", () => {
      renderClaimForm({ isConnected: false, address: undefined });
      expect(screen.getByText(/at the top right/i)).toBeInTheDocument();
    });
  });

  describe("when connected", () => {
    it("should render the receiving wallet section", () => {
      renderClaimForm();
      expect(screen.getByText("Receiving wallet")).toBeInTheDocument();
    });

    it("should display the connected address", () => {
      renderClaimForm();
      expect(screen.getByText(mockAddress)).toBeInTheDocument();
    });

    it("should render recipient override input", () => {
      renderClaimForm();
      expect(
        screen.getByPlaceholderText("Or enter a different address..."),
      ).toBeInTheDocument();
    });

    it("should render the Claim button", () => {
      renderClaimForm();
      expect(screen.getByText("Claim Funds")).toBeInTheDocument();
    });

    it("should show gas fee notice", () => {
      renderClaimForm();
      expect(
        screen.getByText(/Claiming requires a small gas fee/i),
      ).toBeInTheDocument();
    });

    it("should call onClaim when Claim Funds is clicked", () => {
      const { props } = renderClaimForm();
      fireEvent.click(screen.getByText("Claim Funds"));
      expect(props.onClaim).toHaveBeenCalled();
    });

    it("should show error message when error is set", () => {
      renderClaimForm({ error: "Insufficient gas" });
      expect(screen.getByText("Insufficient gas")).toBeInTheDocument();
    });

    it("should show busy state when claiming", () => {
      renderClaimForm({ isBusy: true });
      expect(screen.getByText("Claiming...")).toBeInTheDocument();
    });

    it("should disable claim button when busy", () => {
      renderClaimForm({ isBusy: true });
      expect(screen.getByText("Claiming...")).toBeDisabled();
    });

    it("should disable claim button when on wrong chain", () => {
      renderClaimForm({ isWrongChain: true });
      expect(screen.getByText("Claim Funds")).toBeDisabled();
    });

    it("should call setRecipientOverride when typing in override field", () => {
      const { props } = renderClaimForm();
      const input = screen.getByPlaceholderText("Or enter a different address...");
      fireEvent.change(input, { target: { value: "0xabc" } });
      expect(props.setRecipientOverride).toHaveBeenCalledWith("0xabc");
    });

    it("should show override value when provided", () => {
      renderClaimForm({ recipientOverride: "0xabc123" });
      expect(
        (screen.getByPlaceholderText("Or enter a different address...") as HTMLInputElement)
          .value,
      ).toBe("0xabc123");
    });

    it("should not show address when override is set", () => {
      renderClaimForm({ recipientOverride: "0xabc" });
      expect(screen.queryByText(mockAddress)).not.toBeInTheDocument();
    });

    it("should show recipientError message when set", () => {
      renderClaimForm({ recipientError: "Invalid Ethereum address" });
      expect(screen.getByText("Invalid Ethereum address")).toBeInTheDocument();
    });

    it("should disable claim button when recipientError is set", () => {
      renderClaimForm({ recipientError: "Invalid Ethereum address" });
      expect(screen.getByText("Claim Funds")).toBeDisabled();
    });

    it("should not show recipientError when null", () => {
      renderClaimForm({ recipientError: null });
      expect(screen.queryByText("Invalid Ethereum address")).not.toBeInTheDocument();
    });
  });
});
