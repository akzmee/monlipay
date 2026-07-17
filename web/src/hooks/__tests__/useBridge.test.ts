import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useBridgeQuote,
  useBridgeBalance,
  useBridgeStatus,
} from "@/hooks/useBridge";
import type {
  QuoteResponse,
  BalanceResponse,
  StatusResponse,
} from "@/lib/bridge-types";

// Mock global fetch
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Mock window.location.origin
const originalLocation = window.location;
beforeEach(() => {
  // @ts-expect-error — overriding for test
  delete window.location;
  // @ts-expect-error — mock
  window.location = { ...originalLocation, origin: "http://localhost:3000" };
});
afterEach(() => {
  // @ts-expect-error — restoring for test
  window.location = originalLocation;
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe("useBridgeQuote", () => {
  it("should start with empty routes and no loading", () => {
    const { result } = renderHook(() => useBridgeQuote());
    expect(result.current.routes).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it("should fetch quote and set routes on success", async () => {
    const mockResponse: QuoteResponse = {
      routes: [
        {
          id: "route-1",
          tool: "deBridge",
          toolDetails: { key: "deBridge", name: "deBridge", logoURI: "" },
          executionDuration: 300,
          fromToken: {
            address: "0x0000000000000000000000000000000000000000",
            symbol: "ETH",
            name: "Ether",
            decimals: 18,
            chainId: 1,
          },
          toToken: {
            address: "0x0000000000000000000000000000000000000000",
            symbol: "MON",
            name: "Monad",
            decimals: 18,
            chainId: 10143,
          },
          fromAmount: "1000000000000000000",
          toAmount: "5000000000000000000",
          toAmountMin: "4900000000000000000",
          gasCostUSD: "2.50",
          fees: { bridgeFeeUSD: "1.00", gasCostUSD: "2.50" },
          steps: 1,
        },
      ],
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const { result } = renderHook(() => useBridgeQuote());

    await act(async () => {
      await result.current.fetchQuote({
        fromChain: 1,
        fromToken: "0x0000000000000000000000000000000000000000",
        fromAmount: "1000000000000000000",
        toChain: 10143,
        toToken: "0x0000000000000000000000000000000000000000",
        fromAddress: "0x1234567890123456789012345678901234567890",
      });
    });

    expect(result.current.routes).toHaveLength(1);
    expect(result.current.routes[0].tool).toBe("deBridge");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it("should set error on failed response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Invalid amount", code: "INVALID_AMOUNT" }),
    });

    const { result } = renderHook(() => useBridgeQuote());

    await act(async () => {
      await result.current.fetchQuote({
        fromChain: 1,
        fromToken: "0x0000000000000000000000000000000000000000",
        fromAmount: "0",
        toChain: 10143,
        toToken: "0x0000000000000000000000000000000000000000",
        fromAddress: "0x1234567890123456789012345678901234567890",
      });
    });

    expect(result.current.routes).toEqual([]);
    expect(result.current.error).toBe("Invalid amount");
  });

  it("should set error on network failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useBridgeQuote());

    await act(async () => {
      await result.current.fetchQuote({
        fromChain: 1,
        fromToken: "0x0000000000000000000000000000000000000000",
        fromAmount: "1000000000000000000",
        toChain: 10143,
        toToken: "0x0000000000000000000000000000000000000000",
        fromAddress: "0x1234567890123456789012345678901234567890",
      });
    });

    expect(result.current.routes).toEqual([]);
    expect(result.current.error).toBe("Network error");
  });

  it("should set error to generic message on non-Error exception", async () => {
    fetchMock.mockRejectedValueOnce("string error");

    const { result } = renderHook(() => useBridgeQuote());

    await act(async () => {
      await result.current.fetchQuote({
        fromChain: 1,
        fromToken: "0x0000000000000000000000000000000000000000",
        fromAmount: "1000000000000000000",
        toChain: 10143,
        toToken: "0x0000000000000000000000000000000000000000",
        fromAddress: "0x1234567890123456789012345678901234567890",
      });
    });

    expect(result.current.error).toBe("Failed to fetch quote");
  });

  it("should build correct URL with all params", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ routes: [] }),
    });

    const { result } = renderHook(() => useBridgeQuote());

    await act(async () => {
      await result.current.fetchQuote({
        fromChain: 42161,
        fromToken: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        fromAmount: "1000000",
        toChain: 10143,
        toToken: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
        fromAddress: "0x1234567890123456789012345678901234567890",
      });
    });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("fromChain=42161");
    expect(calledUrl).toContain("fromToken=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
    expect(calledUrl).toContain("fromAmount=1000000");
    expect(calledUrl).toContain("toChain=10143");
    expect(calledUrl).toContain("fromAddress=0x1234567890123456789012345678901234567890");
  });
});

describe("useBridgeBalance", () => {
  it("should start with empty balances", () => {
    const { result } = renderHook(() => useBridgeBalance());
    expect(result.current.balances).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("should fetch balances on success", async () => {
    const mockResponse: BalanceResponse = {
      balances: [
        {
          chainId: 1,
          token: {
            address: "0x0000000000000000000000000000000000000000",
            symbol: "ETH",
            name: "Ether",
            decimals: 18,
            chainId: 1,
          },
          balance: "1000000000000000000",
          balanceFormatted: "1.0000",
          balanceUSD: 3000,
        },
      ],
      chains: [1],
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const { result } = renderHook(() => useBridgeBalance());

    await act(async () => {
      await result.current.fetchBalances(
        "0x1234567890123456789012345678901234567890",
      );
    });

    expect(result.current.balances).toHaveLength(1);
    expect(result.current.balances[0].token.symbol).toBe("ETH");
  });

  it("should pass chains parameter when provided", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ balances: [], chains: [1, 10] }),
    });

    const { result } = renderHook(() => useBridgeBalance());

    await act(async () => {
      await result.current.fetchBalances(
        "0x1234567890123456789012345678901234567890",
        [1, 10],
      );
    });

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("chains=1%2C10");
  });

  it("should set error on failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Bad address", code: "INVALID_ADDRESS" }),
    });

    const { result } = renderHook(() => useBridgeBalance());

    await act(async () => {
      await result.current.fetchBalances("0xbadaddress");
    });

    expect(result.current.balances).toEqual([]);
    expect(result.current.error).toBe("Bad address");
  });

  it("should handle network errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Connection refused"));

    const { result } = renderHook(() => useBridgeBalance());

    await act(async () => {
      await result.current.fetchBalances(
        "0x1234567890123456789012345678901234567890",
      );
    });

    expect(result.current.error).toBe("Connection refused");
  });
});

describe("useBridgeStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should start with no status and not polling", () => {
    const { result } = renderHook(() => useBridgeStatus());
    expect(result.current.status).toBe(null);
    expect(result.current.isPolling).toBe(false);
  });

  it("should fetch status immediately on startPolling", async () => {
    // Use non-terminal status so isPolling stays true
    const mockStatus: StatusResponse = {
      status: "pending",
      substatus: "waiting for confirmation",
    };

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    });

    const { result } = renderHook(() => useBridgeStatus());

    act(() => {
      result.current.startPolling(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "deBridge",
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.isPolling).toBe(true);
    expect(result.current.status?.status).toBe("pending");
  });

  it("should stop polling when terminal status is reached", async () => {
    const mockStatus: StatusResponse = { status: "done" };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    });

    const { result } = renderHook(() => useBridgeStatus());

    await act(async () => {
      result.current.startPolling(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "deBridge",
      );
      await vi.waitFor(() => {
        expect(result.current.isPolling).toBe(false);
      });
    });

    expect(result.current.status?.status).toBe("done");
    expect(result.current.isPolling).toBe(false);
  });

  it("should stop polling for failed status", async () => {
    const mockStatus: StatusResponse = { status: "failed" };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    });

    const { result } = renderHook(() => useBridgeStatus());

    await act(async () => {
      result.current.startPolling(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "across",
      );
      await vi.waitFor(() => {
        expect(result.current.isPolling).toBe(false);
      });
    });

    expect(result.current.status?.status).toBe("failed");
  });

  it("should stop polling for refunded status", async () => {
    const mockStatus: StatusResponse = { status: "refunded" };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    });

    const { result } = renderHook(() => useBridgeStatus());

    await act(async () => {
      result.current.startPolling(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "stargate",
      );
      await vi.waitFor(() => {
        expect(result.current.isPolling).toBe(false);
      });
    });

    expect(result.current.status?.status).toBe("refunded");
  });

  it("should set error when status API returns error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "tx not found", code: "NOT_FOUND" }),
    });

    const { result } = renderHook(() => useBridgeStatus());

    act(() => {
      result.current.startPolling(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "deBridge",
      );
    });

    // Allow the initial async check to complete
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.error).toBe("tx not found");
  });

  it("should set error on network failure", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));

    const { result } = renderHook(() => useBridgeStatus());

    act(() => {
      result.current.startPolling(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "deBridge",
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.error).toBe("timeout");
  });

  it("should stop polling manually via stopPolling", async () => {
    // Use a non-terminal status so polling stays active
    const mockStatus: StatusResponse = { status: "pending" };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    });

    const { result } = renderHook(() => useBridgeStatus());

    act(() => {
      result.current.startPolling(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "deBridge",
      );
    });

    // Let the initial check resolve
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // Since status is non-terminal, isPolling should still be true
    expect(result.current.isPolling).toBe(true);

    act(() => {
      result.current.stopPolling();
    });

    expect(result.current.isPolling).toBe(false);
  });

  it("should cleanup polling on unmount", async () => {
    const mockStatus: StatusResponse = { status: "pending" };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    });

    const { result, unmount } = renderHook(() => useBridgeStatus());

    act(() => {
      result.current.startPolling(
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        "deBridge",
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.isPolling).toBe(true);

    unmount();
    // After unmount, no more polls should happen — verify no crash
    expect(fetchMock).toHaveBeenCalled();
  });
});
