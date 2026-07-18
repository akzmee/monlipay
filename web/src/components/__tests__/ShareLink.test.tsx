import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareLink } from "@/components/ShareLink";

// Mock URL.createObjectURL / revokeObjectURL so SVG download test doesn't blow
// up on jsdom (which doesn't implement them by default).
beforeEach(() => {
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => "blob:mock");
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = vi.fn();
  }
});

describe("ShareLink", () => {
  const mockUrl = "https://monlipay.app/claim#42/0xabc123";
  const mockReset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined);
    vi.mocked(window.open).mockReturnValue(null);
  });

  it("should render the success header", () => {
    render(<ShareLink url={mockUrl} onReset={mockReset} />);
    expect(screen.getByText("Payment link created")).toBeInTheDocument();
  });

  it("should display the URL (in link view)", () => {
    render(<ShareLink url={mockUrl} onReset={mockReset} />);
    expect(screen.getByText(mockUrl)).toBeInTheDocument();
  });

  it("should render Copy button (in link view)", () => {
    render(<ShareLink url={mockUrl} onReset={mockReset} />);
    // Use explicit role to disambiguate from the word "Copy" in the
    // "Save this link now" warning bullet list.
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("should render WhatsApp button", () => {
    render(<ShareLink url={mockUrl} onReset={mockReset} />);
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
  });

  it("should render Telegram button", () => {
    render(<ShareLink url={mockUrl} onReset={mockReset} />);
    expect(screen.getByText("Telegram")).toBeInTheDocument();
  });

  it("should render the warning message", () => {
    render(<ShareLink url={mockUrl} onReset={mockReset} />);
    expect(
      screen.getByText(/Anyone with this link can claim/i),
    ).toBeInTheDocument();
  });

  it("should render 'Create another link' button", () => {
    render(<ShareLink url={mockUrl} onReset={mockReset} />);
    expect(screen.getByText("Create another link")).toBeInTheDocument();
  });

  it("should copy URL to clipboard when Copy is clicked", async () => {
    render(<ShareLink url={mockUrl} onReset={mockReset} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockUrl);
    });
  });

  it("should show 'Copied!' after clicking Copy", async () => {
    render(<ShareLink url={mockUrl} onReset={mockReset} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => {
      expect(screen.getByText("Copied!")).toBeInTheDocument();
    });
  });

  it("should open WhatsApp share when clicked", () => {
    render(<ShareLink url={mockUrl} onReset={mockReset} />);
    fireEvent.click(screen.getByText("WhatsApp"));
    expect(window.open).toHaveBeenCalled();
    const openedUrl = vi.mocked(window.open).mock.calls[0][0] as string;
    expect(openedUrl).toContain("wa.me");
    expect(openedUrl).toContain(encodeURIComponent(mockUrl));
  });

  it("should open Telegram share when clicked", () => {
    render(<ShareLink url={mockUrl} onReset={mockReset} />);
    fireEvent.click(screen.getByText("Telegram"));
    expect(window.open).toHaveBeenCalled();
    const openedUrl = vi.mocked(window.open).mock.calls[0][0] as string;
    expect(openedUrl).toContain("t.me/share/url");
    expect(openedUrl).toContain(encodeURIComponent(mockUrl));
  });

  it("should call onReset when 'Create another link' is clicked", () => {
    render(<ShareLink url={mockUrl} onReset={mockReset} />);
    fireEvent.click(screen.getByText("Create another link"));
    expect(mockReset).toHaveBeenCalled();
  });

  // ===== QR tab tests =====

  describe("QR Code tab", () => {
    it("should default to Link view (URL visible, QR download not visible)", () => {
      render(<ShareLink url={mockUrl} onReset={mockReset} />);
      expect(screen.getByText(mockUrl)).toBeInTheDocument();
      // QR tab exists but isn't active yet.
      expect(screen.queryByText("PNG")).not.toBeInTheDocument();
      expect(screen.queryByText("SVG")).not.toBeInTheDocument();
    });

    it("should have a tablist with Link and QR Code tabs", () => {
      render(<ShareLink url={mockUrl} onReset={mockReset} />);
      const tablist = screen.getByRole("tablist", { name: /share format/i });
      expect(tablist).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Link" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByRole("tab", { name: "QR Code" })).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    it("should switch to QR view when 'QR Code' tab is clicked", () => {
      render(<ShareLink url={mockUrl} onReset={mockReset} />);
      fireEvent.click(screen.getByRole("tab", { name: "QR Code" }));

      // QR view: download buttons visible, URL text hidden.
      expect(screen.getByText("PNG")).toBeInTheDocument();
      expect(screen.getByText("SVG")).toBeInTheDocument();
      expect(screen.queryByText(mockUrl)).not.toBeInTheDocument();
    });

    it("should render a QR code (svg) in QR view", () => {
      render(<ShareLink url={mockUrl} onReset={mockReset} />);
      fireEvent.click(screen.getByRole("tab", { name: "QR Code" }));
      // qrcode.react renders an <svg> for QRCodeSVG.
      const qrContainer = screen.getByLabelText(`QR code for ${mockUrl}`);
      expect(qrContainer.querySelector("svg")).toBeInTheDocument();
    });

    it("should also render a hidden <canvas> for PNG export", () => {
      render(<ShareLink url={mockUrl} onReset={mockReset} />);
      fireEvent.click(screen.getByRole("tab", { name: "QR Code" }));
      const qrContainer = screen.getByLabelText(`QR code for ${mockUrl}`);
      // Hidden canvas is inside a .hidden div.
      expect(qrContainer.querySelector("canvas")).toBeInTheDocument();
    });

    it("should render the help text 'Scan to claim'", () => {
      render(<ShareLink url={mockUrl} onReset={mockReset} />);
      fireEvent.click(screen.getByRole("tab", { name: "QR Code" }));
      expect(screen.getByText(/Scan to claim/i)).toBeInTheDocument();
    });

    it("should switch back to Link view when 'Link' tab is clicked", () => {
      render(<ShareLink url={mockUrl} onReset={mockReset} />);
      // Go to QR.
      fireEvent.click(screen.getByRole("tab", { name: "QR Code" }));
      expect(screen.getByText("PNG")).toBeInTheDocument();
      // Back to Link.
      fireEvent.click(screen.getByRole("tab", { name: "Link" }));
      expect(screen.queryByText("PNG")).not.toBeInTheDocument();
      expect(screen.getByText(mockUrl)).toBeInTheDocument();
    });
  });

  describe("QR download", () => {
    // Stub Canvas 2D context — jsdom doesn't implement it natively, and
    // qrcode.react's QRCodeCanvas calls a handful of ctx methods during
    // render. We return a permissive stub so the component mounts cleanly.
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
      // jsdom doesn't implement HTMLCanvasElement.getContext or toDataURL.
      HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxStub);
      HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,FAKE");
      // createElement("a").click would otherwise throw on jsdom.
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    });

    it("should trigger PNG download when PNG button is clicked", () => {
      render(<ShareLink url={mockUrl} onReset={mockReset} />);
      fireEvent.click(screen.getByRole("tab", { name: "QR Code" }));
      fireEvent.click(screen.getByText("PNG"));

      // Anchor click should have been called (download triggered).
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
      // And the anchor's download filename should be set via the link
      // that was created + clicked. We can check the last call's `this`.
      const anchor = (HTMLAnchorElement.prototype.click as any).mock
        .instances.at(-1) as HTMLAnchorElement;
      expect(anchor?.download).toBe("monlipay-claim.png");
      expect(anchor?.href).toContain("data:image/png");
    });

    it("should trigger SVG download when SVG button is clicked", () => {
      render(<ShareLink url={mockUrl} onReset={mockReset} />);
      fireEvent.click(screen.getByRole("tab", { name: "QR Code" }));
      fireEvent.click(screen.getByText("SVG"));

      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
      const anchor = (HTMLAnchorElement.prototype.click as any).mock
        .instances.at(-1) as HTMLAnchorElement;
      expect(anchor?.download).toBe("monlipay-claim.svg");
      expect(anchor?.href).toContain("blob:"); // SVG uses Blob URL
    });
  });
});
