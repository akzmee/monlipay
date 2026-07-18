import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

// Mock motion/react so the modal renders synchronously.
vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

// jsdom doesn't implement HTMLCanvasElement.getContext natively — qrcode.react
// needs it during QRCodeCanvas render. Stub a permissive 2D context.
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
  // createElement("a").click would otherwise throw on jsdom.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

import { QRPreviewModal } from "@/components/QRPreviewModal";

const MOCK_URL = "https://monlipay.app/claim#42/0xabc123";

describe("QRPreviewModal", () => {
  describe("when closed", () => {
    it("should render nothing when open=false", () => {
      render(
        <QRPreviewModal open={false} onClose={vi.fn()} url={MOCK_URL} />,
      );
      expect(
        screen.queryByRole("dialog", { name: /qr code/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("when open", () => {
    it("should render the dialog", () => {
      render(<QRPreviewModal open={true} onClose={vi.fn()} url={MOCK_URL} />);
      expect(
        screen.getByRole("dialog", { name: /qr code/i }),
      ).toBeInTheDocument();
    });

    it("should show the 'Payment QR code' title", () => {
      render(<QRPreviewModal open={true} onClose={vi.fn()} url={MOCK_URL} />);
      expect(screen.getByText("Payment QR code")).toBeInTheDocument();
    });

    it("should render a QR code (svg) for the URL", () => {
      render(<QRPreviewModal open={true} onClose={vi.fn()} url={MOCK_URL} />);
      const qrContainer = screen.getByLabelText(`QR code for ${MOCK_URL}`);
      expect(qrContainer.querySelector("svg")).toBeInTheDocument();
    });

    it("should also render a hidden canvas for PNG export", () => {
      render(<QRPreviewModal open={true} onClose={vi.fn()} url={MOCK_URL} />);
      const qrContainer = screen.getByLabelText(`QR code for ${MOCK_URL}`);
      expect(qrContainer.querySelector("canvas")).toBeInTheDocument();
    });

    it("should show the URL the QR encodes", () => {
      render(<QRPreviewModal open={true} onClose={vi.fn()} url={MOCK_URL} />);
      // The URL appears in the "Scans to: ..." line.
      expect(screen.getByText(/Scans to:/i)).toBeInTheDocument();
      expect(screen.getByText(MOCK_URL)).toBeInTheDocument();
    });

    it("should show PNG and SVG download buttons", () => {
      render(<QRPreviewModal open={true} onClose={vi.fn()} url={MOCK_URL} />);
      expect(screen.getByText("PNG")).toBeInTheDocument();
      expect(screen.getByText("SVG")).toBeInTheDocument();
    });

    it("should show help text mentioning scan + SVG", () => {
      render(<QRPreviewModal open={true} onClose={vi.fn()} url={MOCK_URL} />);
      expect(screen.getByText(/Scan to claim/i)).toBeInTheDocument();
    });
  });

  describe("dismissal", () => {
    it("should call onClose when the X button is clicked", () => {
      const onClose = vi.fn();
      render(<QRPreviewModal open={true} onClose={onClose} url={MOCK_URL} />);
      fireEvent.click(screen.getByLabelText(/close/i));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should call onClose when the backdrop is clicked", () => {
      const onClose = vi.fn();
      render(<QRPreviewModal open={true} onClose={onClose} url={MOCK_URL} />);
      const backdrop = screen.getByRole("dialog", { name: /qr code/i });
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should call onClose on Escape key", () => {
      const onClose = vi.fn();
      render(<QRPreviewModal open={true} onClose={onClose} url={MOCK_URL} />);
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should NOT call onClose when clicking inside the panel", () => {
      const onClose = vi.fn();
      render(<QRPreviewModal open={true} onClose={onClose} url={MOCK_URL} />);
      // Click the PNG button — should NOT close (it's an action inside the panel).
      fireEvent.click(screen.getByText("PNG"));
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("downloads", () => {
    it("should trigger PNG download when PNG is clicked", () => {
      render(<QRPreviewModal open={true} onClose={vi.fn()} url={MOCK_URL} />);
      fireEvent.click(screen.getByText("PNG"));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
      const anchor = (
        HTMLAnchorElement.prototype.click as any
      ).mock.instances.at(-1) as HTMLAnchorElement;
      expect(anchor?.download).toBe("monlipay-claim.png");
      expect(anchor?.href).toContain("data:image/png");
    });

    it("should trigger SVG download when SVG is clicked", () => {
      render(<QRPreviewModal open={true} onClose={vi.fn()} url={MOCK_URL} />);
      fireEvent.click(screen.getByText("SVG"));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
      const anchor = (
        HTMLAnchorElement.prototype.click as any
      ).mock.instances.at(-1) as HTMLAnchorElement;
      expect(anchor?.download).toBe("monlipay-claim.svg");
      expect(anchor?.href).toContain("blob:");
    });
  });
});
