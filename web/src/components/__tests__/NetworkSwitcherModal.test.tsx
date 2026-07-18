import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

// Mock motion/react so the modal renders synchronously without animations.
vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => (
      <button {...props}>{children}</button>
    ),
  },
}));

// Mock window.location so we can assert redirects without jsdom navigation
// warnings.
const originalLocation = window.location;
beforeEach(() => {
  // @ts-expect-error — jsdom allows delete + reassignment
  delete window.location;
  window.location = {
    ...originalLocation,
    hostname: "localhost",
    href: "http://localhost/",
  } as typeof window.location;
});
afterEach(() => {
  window.location = originalLocation;
});

// Mock matchMedia for any prefers-reduced-motion queries.
beforeEach(() => {
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as any;
  }
});

import { NetworkSwitcherModal } from "@/components/NetworkSwitcherModal";

describe("NetworkSwitcherModal", () => {
  describe("when closed", () => {
    it("should render nothing when open=false", () => {
      render(<NetworkSwitcherModal open={false} onClose={vi.fn()} />);
      expect(
        screen.queryByRole("dialog", { name: /switch network/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("when open", () => {
    beforeEach(() => {
      window.location.hostname = "localhost";
    });

    it("should render the dialog", () => {
      render(<NetworkSwitcherModal open={true} onClose={vi.fn()} />);
      expect(
        screen.getByRole("dialog", { name: /switch network/i }),
      ).toBeInTheDocument();
    });

    it("should show 'Switch Network' title", () => {
      render(<NetworkSwitcherModal open={true} onClose={vi.fn()} />);
      expect(screen.getByText("Switch Network")).toBeInTheDocument();
    });

    it("should list Monad Testnet and Monad Mainnet", () => {
      render(<NetworkSwitcherModal open={true} onClose={vi.fn()} />);
      expect(screen.getByText("Monad Testnet")).toBeInTheDocument();
      expect(screen.getByText("Monad Mainnet")).toBeInTheDocument();
    });

    it("should mark the active network (testnet by default in tests) with 'Active' badge", () => {
      render(<NetworkSwitcherModal open={true} onClose={vi.fn()} />);
      const activeBadge = screen.getByText("Active");
      const row = activeBadge.closest("button");
      expect(row).toHaveTextContent("Monad Testnet");
      expect(row).toHaveAttribute("aria-checked", "true");
    });

    it("should show 'Switch →' affordance on the inactive network", () => {
      render(<NetworkSwitcherModal open={true} onClose={vi.fn()} />);
      // Mainnet is inactive in the default test env.
      const mainnetRow = screen
        .getByText("Monad Mainnet")
        .closest("button");
      expect(mainnetRow).toHaveAttribute("aria-checked", "false");
      expect(mainnetRow).toHaveTextContent(/Switch/);
    });

    it("should show chain ID in the description", () => {
      render(<NetworkSwitcherModal open={true} onClose={vi.fn()} />);
      expect(screen.getByText(/Chain 10143/)).toBeInTheDocument();
      expect(screen.getByText(/Chain 143/)).toBeInTheDocument();
    });
  });

  describe("dismissal", () => {
    beforeEach(() => {
      window.location.hostname = "localhost";
    });

    it("should call onClose when the X button is clicked", () => {
      const onClose = vi.fn();
      render(<NetworkSwitcherModal open={true} onClose={onClose} />);
      fireEvent.click(screen.getByLabelText(/close/i));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should call onClose when the backdrop is clicked", () => {
      const onClose = vi.fn();
      render(<NetworkSwitcherModal open={true} onClose={onClose} />);
      // The backdrop is the outer motion.div with role="dialog".
      const backdrop = screen.getByRole("dialog", { name: /switch network/i });
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should call onClose on Escape key", () => {
      const onClose = vi.fn();
      render(<NetworkSwitcherModal open={true} onClose={onClose} />);
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should call onClose when clicking inside the panel (any row click dismisses)", () => {
      const onClose = vi.fn();
      render(<NetworkSwitcherModal open={true} onClose={onClose} />);
      // Click a row — onClose fires (even if redirect is a no-op).
      fireEvent.click(screen.getByText("Monad Testnet"));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should NOT call onClose when clicking the panel padding (not a row)", () => {
      const onClose = vi.fn();
      const { container } = render(
        <NetworkSwitcherModal open={true} onClose={onClose} />,
      );
      // Click the help text at the bottom — should NOT close.
      const help = screen.getByText(/Each network runs on its own domain/);
      fireEvent.click(help);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("redirect behavior", () => {
    it("should NOT redirect when running on localhost (dev mode)", () => {
      window.location.hostname = "localhost";
      render(<NetworkSwitcherModal open={true} onClose={vi.fn()} />);
      fireEvent.click(screen.getByText("Monad Mainnet"));
      expect(window.location.href).toBe("http://localhost/");
    });

    it("should show dev-mode notice when on localhost", () => {
      window.location.hostname = "localhost";
      render(<NetworkSwitcherModal open={true} onClose={vi.fn()} />);
      expect(screen.getByText(/dev mode/i)).toBeInTheDocument();
    });

    it("should show dev-mode notice when on 127.0.0.1", () => {
      window.location.hostname = "127.0.0.1";
      render(<NetworkSwitcherModal open={true} onClose={vi.fn()} />);
      expect(screen.getByText(/dev mode/i)).toBeInTheDocument();
    });

    it("should show dev-mode notice when on *.vercel.app", () => {
      window.location.hostname = "monlipay.vercel.app";
      render(<NetworkSwitcherModal open={true} onClose={vi.fn()} />);
      expect(screen.getByText(/dev mode/i)).toBeInTheDocument();
    });

    it("should NOT show dev-mode notice on production domain", () => {
      window.location.hostname = "testnet.monlipay.xyz";
      render(<NetworkSwitcherModal open={true} onClose={vi.fn()} />);
      expect(screen.queryByText(/dev mode/i)).not.toBeInTheDocument();
    });

    it("should redirect when clicking the other network on a production origin", () => {
      window.location.hostname = "testnet.monlipay.xyz";
      render(<NetworkSwitcherModal open={true} onClose={vi.fn()} />);
      fireEvent.click(screen.getByText("Monad Mainnet"));
      expect(window.location.href).toBe("https://monlipay.xyz");
    });

    it("should NOT redirect when clicking the currently active network", () => {
      window.location.hostname = "testnet.monlipay.xyz";
      render(<NetworkSwitcherModal open={true} onClose={vi.fn()} />);
      fireEvent.click(screen.getByText("Monad Testnet"));
      expect(window.location.href).toBe("http://localhost/");
    });
  });
});
