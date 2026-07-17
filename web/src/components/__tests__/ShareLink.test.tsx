import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareLink } from "@/components/ShareLink";

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

  it("should display the URL", () => {
    render(<ShareLink url={mockUrl} onReset={mockReset} />);
    expect(screen.getByText(mockUrl)).toBeInTheDocument();
  });

  it("should render Copy button", () => {
    render(<ShareLink url={mockUrl} onReset={mockReset} />);
    expect(screen.getByText("Copy")).toBeInTheDocument();
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
    fireEvent.click(screen.getByText("Copy"));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockUrl);
    });
  });

  it("should show 'Copied!' after clicking Copy", async () => {
    render(<ShareLink url={mockUrl} onReset={mockReset} />);
    fireEvent.click(screen.getByText("Copy"));
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
});
