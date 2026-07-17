import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavBar } from "@/components/NavBar";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// Mock ConnectButton to avoid wagmi/RainbowKit complexity
vi.mock("@/components/ConnectButton", () => ({
  ConnectButton: () => <div data-testid="connect-button">Connect</div>,
}));

// Mock ThemeToggle to avoid next-themes complexity
vi.mock("@/components/ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle">Toggle</div>,
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe("NavBar", () => {
  it("should render the logo with 'MonliPay' text", () => {
    render(<NavBar />);
    expect(screen.getByText("Monli")).toBeInTheDocument();
    expect(screen.getByText("Pay")).toBeInTheDocument();
  });

  it("should render the Create nav link", () => {
    render(<NavBar />);
    expect(screen.getByText("Create")).toBeInTheDocument();
  });

  it("should render the My Links nav link", () => {
    render(<NavBar />);
    expect(screen.getByText("My Links")).toBeInTheDocument();
  });

  it("should render the ConnectButton", () => {
    render(<NavBar />);
    expect(screen.getByTestId("connect-button")).toBeInTheDocument();
  });

  it("should render the ThemeToggle", () => {
    render(<NavBar />);
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
  });

  it("should link Create to /create", () => {
    render(<NavBar />);
    const link = screen.getByText("Create").closest("a");
    expect(link?.getAttribute("href")).toBe("/create");
  });

  it("should link My Links to /my-links", () => {
    render(<NavBar />);
    const link = screen.getByText("My Links").closest("a");
    expect(link?.getAttribute("href")).toBe("/my-links");
  });

  it("should link logo to /", () => {
    render(<NavBar />);
    const logoLink = screen.getByText("Monli").closest("a");
    expect(logoLink?.getAttribute("href")).toBe("/");
  });
});
