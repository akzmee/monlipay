import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { OpenInWallet } from "@/components/OpenInWallet";

// Mock the wallet lib
vi.mock("@/lib/wallet", () => ({
  needsWalletBrowser: vi.fn(),
  getMetaMaskDeepLink: vi.fn(),
}));

import { needsWalletBrowser, getMetaMaskDeepLink } from "@/lib/wallet";

describe("OpenInWallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null when not on mobile wallet browser", () => {
    vi.mocked(needsWalletBrowser).mockReturnValue(false);
    const { container } = render(<OpenInWallet />);
    expect(container.firstChild).toBeNull();
  });

  it("should render banner when needsWalletBrowser returns true", () => {
    vi.mocked(needsWalletBrowser).mockReturnValue(true);
    vi.mocked(getMetaMaskDeepLink).mockReturnValue(
      "https://metamask.app.link/dapp/example.com",
    );

    render(<OpenInWallet />);

    expect(screen.getByText("Open in MetaMask to claim")).toBeInTheDocument();
    expect(
      screen.getByText(/Tap below to open this page in MetaMask/),
    ).toBeInTheDocument();
    expect(screen.getByText("Open in MetaMask")).toBeInTheDocument();
  });

  it("should use the deep link URL from getMetaMaskDeepLink", () => {
    vi.mocked(needsWalletBrowser).mockReturnValue(true);
    vi.mocked(getMetaMaskDeepLink).mockReturnValue(
      "https://metamask.app.link/dapp/foo.com/claim",
    );

    render(<OpenInWallet />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://metamask.app.link/dapp/foo.com/claim",
    );
  });
});
