import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

// Mock motion/react so QRPreviewModal (rendered by LinkCard) mounts cleanly.
vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

// jsdom doesn't implement canvas — qrcode.react needs a context stub.
const ctxStub = {
  fillRect: vi.fn(),
  drawImage: vi.fn(),
  fillStyle: "",
  strokeStyle: "",
  scale: vi.fn(),
  translate: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  arcTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  rect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  setTransform: vi.fn(),
  rotate: vi.fn(),
  transform: vi.fn(),
  getImageData: vi.fn(() => ({ data: [] })),
  putImageData: vi.fn(),
  createImageData: vi.fn(() => ({ data: [] })),
} as unknown as CanvasRenderingContext2D;

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxStub);
  HTMLCanvasElement.prototype.toDataURL = vi.fn(
    () => "data:image/png;base64,FAKE",
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

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

  // ---------------------------------------------------------------
  // shareableUrl — for re-copying if the user forgot the link
  // ---------------------------------------------------------------
  describe("shareableUrl", () => {
    it("should render the shareable URL and Copy button when provided", () => {
      const url = "https://monlipay.app/claim#1-0xabc";
      renderLinkCard({ shareableUrl: url });
      expect(screen.getByText(url)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    });

    it("should NOT render the URL row when shareableUrl is missing", () => {
      renderLinkCard({ shareableUrl: undefined });
      expect(screen.queryByRole("button", { name: /copy/i })).not.toBeInTheDocument();
      // It should show a muted hint instead
      expect(
        screen.getByText(/Link URL not saved/i),
      ).toBeInTheDocument();
    });

    it("should NOT render the URL row for claimed links (no point sharing)", () => {
      const url = "https://monlipay.app/claim#1-0xabc";
      renderLinkCard({ shareableUrl: url, isClaimed: true });
      expect(screen.queryByText(url)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /copy/i }),
      ).not.toBeInTheDocument();
    });

    it("should copy URL to clipboard and show 'Copied' state when Copy is clicked", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      const url = "https://monlipay.app/claim#1-0xabc";
      renderLinkCard({ shareableUrl: url });

      fireEvent.click(screen.getByRole("button", { name: /copy/i }));
      // Wait for the async clipboard call and state update
      await screen.findByText("Copied");
      expect(writeText).toHaveBeenCalledWith(url);
    });

    it("should gracefully handle clipboard API rejection (no crash)", async () => {
      const writeText = vi.fn().mockRejectedValue(new Error("denied"));
      Object.assign(navigator, { clipboard: { writeText } });

      const url = "https://monlipay.app/claim#1-0xabc";
      renderLinkCard({ shareableUrl: url });

      // Should not throw
      fireEvent.click(screen.getByRole("button", { name: /copy/i }));
      // Button should remain "Copy" (no "Copied")
      expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------
  // QR button — opens QRPreviewModal for the shareable URL
  // ---------------------------------------------------------------
  describe("QR button", () => {
    it("should render a QR button when shareableUrl is provided", () => {
      const url = "https://monlipay.app/claim#1-0xabc";
      renderLinkCard({ shareableUrl: url });
      expect(
        screen.getByRole("button", { name: /show qr code/i }),
      ).toBeInTheDocument();
    });

    it("should NOT render a QR button when shareableUrl is missing", () => {
      renderLinkCard({ shareableUrl: undefined });
      expect(
        screen.queryByRole("button", { name: /show qr code/i }),
      ).not.toBeInTheDocument();
    });

    it("should NOT render a QR button for claimed links", () => {
      const url = "https://monlipay.app/claim#1-0xabc";
      renderLinkCard({ shareableUrl: url, isClaimed: true });
      expect(
        screen.queryByRole("button", { name: /show qr code/i }),
      ).not.toBeInTheDocument();
    });

    it("should open the QR modal when clicked", () => {
      const url = "https://monlipay.app/claim#1-0xabc";
      renderLinkCard({ shareableUrl: url });
      // Modal not yet present.
      expect(
        screen.queryByRole("dialog", { name: /qr code/i }),
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /show qr code/i }));
      // Now the modal should be present and encode the URL.
      expect(
        screen.getByRole("dialog", { name: /qr code/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(`QR code for ${url}`),
      ).toBeInTheDocument();
    });
  });
});
