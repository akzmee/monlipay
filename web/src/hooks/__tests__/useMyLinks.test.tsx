import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { IndexedLink } from "@/lib/indexer-client";

// ---------------------------------------------------------------------------
// Mocks — module-scope so the hook's dynamic imports resolve to our fakes.
// ---------------------------------------------------------------------------

const mockFetchLinks = vi.fn();
let mockIsIndexerConfiguredValue = true;

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: CURRENT_ADDRESS.current }),
}));

vi.mock("@/lib/indexer-client", () => ({
  fetchLinks: (...args: unknown[]) => mockFetchLinks(...args),
  get isIndexerConfigured() {
    return mockIsIndexerConfiguredValue;
  },
}));

// Import AFTER mocks are registered.
import { useMyLinks } from "@/hooks/useMyLinks";

// Mutable "current address" used by the wagmi mock. Tests change this to
// simulate connect / disconnect / wallet switch.
const CURRENT_ADDRESS: { current: `0x${string}` | undefined } = {
  current: undefined,
};

// A valid 40-hex address (lowercase) used as the default connected wallet.
const ADDR_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
const ADDR_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`;

// Helper to build an IndexedLink row with sane defaults.
function makeLink(overrides: Partial<IndexedLink> = {}): IndexedLink {
  return {
    depositId: 1n,
    sender: ADDR_A,
    token: "0x0000000000000000000000000000000000000000",
    amount: 1_000_000_000_000_000_000n,
    expiry: BigInt(Math.floor(Date.now() / 1000) + 3600),
    status: "active",
    recipient: null,
    createdAtBlock: 100,
    createdAtTs: Math.floor(Date.now() / 1000),
    closedAtBlock: null,
    closedAtTs: null,
    chainId: 143,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useMyLinks", () => {
  beforeEach(() => {
    CURRENT_ADDRESS.current = undefined;
    mockFetchLinks.mockReset();
    mockIsIndexerConfiguredValue = true;
    mockFetchLinks.mockResolvedValue([]);
  });

  // -------------------------------------------------------------------
  // Initial state — no address
  // -------------------------------------------------------------------
  it("initializes with empty links and isLoading=false", () => {
    const { result } = renderHook(() => useMyLinks());
    expect(result.current.links).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.indexerConfigured).toBe(true);
  });

  // -------------------------------------------------------------------
  // No address — refresh() returns early without fetching
  // -------------------------------------------------------------------
  it("does not fetch when address is undefined", async () => {
    const { result } = renderHook(() => useMyLinks());
    await act(async () => {
      await result.current.refresh();
    });
    expect(mockFetchLinks).not.toHaveBeenCalled();
    expect(result.current.links).toEqual([]);
  });

  // -------------------------------------------------------------------
  // Indexer not configured — surfaces soft error
  // -------------------------------------------------------------------
  it("surfaces an error when indexer is not configured", async () => {
    mockIsIndexerConfiguredValue = false;
    CURRENT_ADDRESS.current = ADDR_A;
    const { result } = renderHook(() => useMyLinks());

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockFetchLinks).not.toHaveBeenCalled();
    expect(result.current.links).toEqual([]);
    expect(result.current.error).toMatch(/Indexer not configured/);
    expect(result.current.indexerConfigured).toBe(false);
  });

  // -------------------------------------------------------------------
  // Happy path — fetch returns links
  // -------------------------------------------------------------------
  it("fetches and stores links for the connected address", async () => {
    CURRENT_ADDRESS.current = ADDR_A;
    const link = makeLink();
    mockFetchLinks.mockResolvedValue([link]);

    const { result } = renderHook(() => useMyLinks());

    await waitFor(() => {
      expect(result.current.links).toHaveLength(1);
    });
    expect(result.current.links[0]).toEqual(link);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    // Confirm we passed the address to fetchLinks.
    expect(mockFetchLinks).toHaveBeenCalledWith(
      ADDR_A,
      undefined,
      expect.any(AbortSignal),
    );
  });

  // -------------------------------------------------------------------
  // Fetch error — surfaces error message, keeps previous links
  // -------------------------------------------------------------------
  it("surfaces error message and keeps previous links when fetch fails", async () => {
    CURRENT_ADDRESS.current = ADDR_A;
    const originalLink = makeLink({ depositId: 1n });
    mockFetchLinks.mockResolvedValueOnce([originalLink]);

    const { result } = renderHook(() => useMyLinks());

    await waitFor(() => {
      expect(result.current.links).toHaveLength(1);
    });

    // Now make the next fetch fail.
    mockFetchLinks.mockRejectedValue(new Error("network down"));
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe("network down");
    // Previous links remain — better than flickering to empty.
    expect(result.current.links).toEqual([originalLink]);
  });

  // -------------------------------------------------------------------
  // Generic non-Error throw — surfaces a fallback message
  // -------------------------------------------------------------------
  it("surfaces a generic message for non-Error throws", async () => {
    CURRENT_ADDRESS.current = ADDR_A;
    mockFetchLinks.mockRejectedValue("string error");

    const { result } = renderHook(() => useMyLinks());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe("Failed to load links");
  });

  // -------------------------------------------------------------------
  // AbortError from AbortController — not surfaced as user-visible error
  // -------------------------------------------------------------------
  it("suppresses AbortError from aborted fetches", async () => {
    CURRENT_ADDRESS.current = ADDR_A;
    const abortError = new DOMException("Aborted", "AbortError");
    mockFetchLinks.mockRejectedValue(abortError);

    const { result } = renderHook(() => useMyLinks());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBeNull();
  });

  // -------------------------------------------------------------------
  // Manual refresh() — can be called multiple times
  // -------------------------------------------------------------------
  it("manual refresh() triggers a new fetch", async () => {
    CURRENT_ADDRESS.current = ADDR_A;
    mockFetchLinks.mockResolvedValue([]);

    const { result } = renderHook(() => useMyLinks());

    await waitFor(() => expect(mockFetchLinks).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.refresh();
    });
    expect(mockFetchLinks).toHaveBeenCalledTimes(2);

    await act(async () => {
      await result.current.refresh();
    });
    expect(mockFetchLinks).toHaveBeenCalledTimes(3);
  });

  // -------------------------------------------------------------------
  // Status filter — passed through to fetchLinks
  // -------------------------------------------------------------------
  it("passes the status filter through to fetchLinks", async () => {
    CURRENT_ADDRESS.current = ADDR_A;
    mockFetchLinks.mockResolvedValue([]);

    renderHook(() => useMyLinks({ status: "refunded" }));

    await waitFor(() => expect(mockFetchLinks).toHaveBeenCalledTimes(1));
    expect(mockFetchLinks).toHaveBeenCalledWith(
      ADDR_A,
      "refunded",
      expect.any(AbortSignal),
    );
  });

  // -------------------------------------------------------------------
  // AbortController — aborts in-flight fetch on unmount
  // -------------------------------------------------------------------
  it("aborts the in-flight fetch on unmount", async () => {
    CURRENT_ADDRESS.current = ADDR_A;
    let observedSignal: AbortSignal | undefined;
    mockFetchLinks.mockImplementation(
      (_addr: unknown, _status: unknown, signal: AbortSignal) => {
        observedSignal = signal;
        return new Promise<IndexedLink[]>(() => {
          // Never resolves — we want it to stay in flight so we can
          // observe the abort.
        });
      },
    );

    const { unmount } = renderHook(() => useMyLinks());
    await waitFor(() => expect(observedSignal).toBeDefined());
    expect(observedSignal!.aborted).toBe(false);

    unmount();

    // The unmount effect should have called abort() on the controller.
    expect(observedSignal!.aborted).toBe(true);
  });
});
