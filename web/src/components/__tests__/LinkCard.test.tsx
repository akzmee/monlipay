import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LinkCard } from "@/components/LinkCard";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function renderLinkCard(overrides: Partial<Parameters<typeof LinkCard>[0]> = {}) {
  const props = {
    depositId: "1",
    amount: "1.5",
    token: ZERO_ADDR,
    expiry: Math.floor(Date.now() / 1000) + 3600,
    isClaimed: false,
    isExpired: false,
    canRefund: false,
    isBusy: false,
    onRefund: vi.fn(),
    ...overrides,
  };
  return { ...render(<LinkCard {...props} />), props };
}

describe("LinkCard", () => {
  it("should display the amount and token symbol", () => {
    renderLinkCard();
    // The amount and symbol are combined in a single span: "1.5 MON"
    expect(screen.getByText(/1\.5/)).toBeInTheDocument();
    expect(screen.getByText(/MON/)).toBeInTheDocument();
  });

  it("should display the deposit ID", () => {
    renderLinkCard({ depositId: "42" });
    expect(screen.getByText("#42")).toBeInTheDocument();
  });

  it("should show 'Active' status for unclaimed, non-expired links", () => {
    renderLinkCard({ isClaimed: false, isExpired: false });
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("should show 'Claimed' status for claimed links", () => {
    renderLinkCard({ isClaimed: true });
    expect(screen.getByText("Claimed")).toBeInTheDocument();
  });

  it("should show 'Expired — refundable' status for expired unclaimed links", () => {
    renderLinkCard({ isExpired: true, isClaimed: false });
    expect(screen.getByText("Expired — refundable")).toBeInTheDocument();
  });

  it("should not show refund button when canRefund is false", () => {
    renderLinkCard({ canRefund: false });
    expect(screen.queryByText("Refund")).not.toBeInTheDocument();
  });

  it("should show refund button when canRefund is true", () => {
    renderLinkCard({ canRefund: true });
    expect(screen.getByText("Refund")).toBeInTheDocument();
  });

  it("should call onRefund when Refund is clicked", () => {
    const { props } = renderLinkCard({ canRefund: true });
    fireEvent.click(screen.getByText("Refund"));
    expect(props.onRefund).toHaveBeenCalled();
  });

  it("should show 'Refunding...' and disable button when isBusy", () => {
    renderLinkCard({ canRefund: true, isBusy: true });
    const button = screen.getByText("Refunding...");
    expect(button).toBeDisabled();
  });

  it("should show expiry countdown for active links", () => {
    renderLinkCard({ isClaimed: false, isExpired: false });
    // The countdown should show some time remaining
    expect(screen.getByText(/Expires in/i)).toBeInTheDocument();
  });

  it("should not show countdown for claimed links", () => {
    renderLinkCard({ isClaimed: true });
    expect(screen.queryByText(/Expires in/i)).not.toBeInTheDocument();
  });

  it("should display TOKEN for non-native tokens", () => {
    renderLinkCard({
      token: "0x1234567890123456789012345678901234567890",
      amount: "50",
    });
    // Combined text: "50 TOKEN"
    expect(screen.getByText(/TOKEN/)).toBeInTheDocument();
  });
});
