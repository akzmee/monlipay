import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";

// --- Mocks (module-scope so the hook resolves them via dynamic imports) ---

const mockSendTransactionAsync = vi.fn();
const mockWaitForReceipt = vi.fn();
const mockFetchExpiredLinks = vi.fn();
const mockIsIndexerConfigured = vi.fn(() => true);

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
    isConnected: true,
  }),
  useSendTransaction: () => ({
    sendTransactionAsync: mockSendTransactionAsync,
    isPending: false,
    data: undefined,
  }),
  useReadContract: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("wagmi/actions", () => ({
  waitForTransactionReceipt: (...args: unknown[]) =>
    mockWaitForReceipt(...args),
}));

vi.mock("@/config/wagmi", () => ({ wagmiConfig: {} }));

vi.mock("viem", () => ({
  encodeFunctionData: () => "0xencoded",
}));

vi.mock("@/lib/indexer-client", () => ({
  fetchExpiredLinks: (...args: unknown[]) => mockFetchExpiredLinks(...args),
  // isIndexerConfigured must be a BOOLEAN (the real module exports a const bool,
  // not a function) so the hook's `if (!isIndexerConfigured)` check works.
  get isIndexerConfigured() {
    return mockIsIndexerConfigured();
  },
}));

vi.mock("@/config/chain", () => ({
  LINK_VAULT_ADDRESS: "0xvault" as `0x${string}`,
  monadChain: { id: 10143 },
}));

vi.mock("@/lib/abi", () => ({ linkVaultAbi: [] }));

// Helper: an active expired link owned by the mocked address.
// Shape matches IndexedLink from @/lib/indexer-client (bigint fields,
// status = "active").
function expiredLink(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    depositId: 1n,
    sender: "0x1234567890123456789012345678901234567890",
    token: "0x0000000000000000000000000000000000000000",
    amount: 1_000_000_000_000_000_000n,
    expiry: BigInt(Math.floor(Date.now() / 1000) - 3600),
    status: "active" as const,
    recipient: null,
    createdAtBlock: 100,
    createdAtTs: Math.floor(Date.now() / 1000) - 7200,
    closedAtBlock: null,
    closedAtTs: null,
    chainId: 10143,
    ...overrides,
  };
}

describe("useAutoRefundExpiredLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchExpiredLinks.mockResolvedValue([]);
    mockIsIndexerConfigured.mockReturnValue(true);
    mockSendTransactionAsync.mockReset();
    mockWaitForReceipt.mockReset();
  });

  // -----------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------
  it("should initialize with idle state", async () => {
    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.refundedCount).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.failedDepositIds.size).toBe(0);
    expect(typeof result.current.processExpiredLinks).toBe("function");
    expect(typeof result.current.reset).toBe("function");
  });

  // -----------------------------------------------------------------
  // No expired links → no-op
  // -----------------------------------------------------------------
  it("should set refundedCount=0 and skip when no expired links", async () => {
    mockFetchExpiredLinks.mockResolvedValue([]);
    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks(
        "0x1234567890123456789012345678901234567890",
      );
    });

    expect(result.current.refundedCount).toBe(0);
    expect(mockSendTransactionAsync).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------
  // Happy path: one expired link → refunded
  // -----------------------------------------------------------------
  it("should refund an expired link", async () => {
    mockFetchExpiredLinks.mockResolvedValue([expiredLink()]);
    mockSendTransactionAsync.mockResolvedValue("0xhash");
    mockWaitForReceipt.mockResolvedValue({ status: "success", logs: [] });

    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks(
        "0x1234567890123456789012345678901234567890",
      );
    });

    expect(result.current.refundedCount).toBe(1);
    expect(result.current.failedDepositIds.size).toBe(0);
    expect(result.current.error).toBeNull();
  });

  // -----------------------------------------------------------------
  // Reverted receipt → per-link failure
  // -----------------------------------------------------------------
  it("should record a per-link failure when receipt reverts", async () => {
    mockFetchExpiredLinks.mockResolvedValue([expiredLink()]);
    mockSendTransactionAsync.mockResolvedValue("0xhash");
    mockWaitForReceipt.mockResolvedValue({ status: "reverted", logs: [] });

    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks(
        "0x1234567890123456789012345678901234567890",
      );
    });

    expect(result.current.refundedCount).toBe(0);
    expect(result.current.failedDepositIds.has("1")).toBe(true);
    expect(result.current.error).toContain("Could not auto-refund");
  });

  // -----------------------------------------------------------------
  // sendTransactionAsync throws → per-link failure
  // -----------------------------------------------------------------
  it("should record a per-link failure when sendTransaction throws", async () => {
    mockFetchExpiredLinks.mockResolvedValue([expiredLink()]);
    mockSendTransactionAsync.mockRejectedValue(new Error("Nonce too low"));

    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks(
        "0x1234567890123456789012345678901234567890",
      );
    });

    expect(result.current.refundedCount).toBe(0);
    expect(result.current.failedDepositIds.has("1")).toBe(true);
  });

  // -----------------------------------------------------------------
  // Partial failure: 1 success + 1 failure
  // -----------------------------------------------------------------
  it("should surface partial failures without top-level error", async () => {
    mockFetchExpiredLinks.mockResolvedValue([
      expiredLink({ depositId: 1n }),
      expiredLink({ depositId: 2n }),
    ]);
    mockSendTransactionAsync
      .mockResolvedValueOnce("0xhash1")
      .mockRejectedValueOnce(new Error("rejected"));
    mockWaitForReceipt.mockResolvedValue({ status: "success", logs: [] });

    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks(
        "0x1234567890123456789012345678901234567890",
      );
    });

    expect(result.current.refundedCount).toBe(1);
    expect(result.current.failedDepositIds.has("2")).toBe(true);
    expect(result.current.failedDepositIds.has("1")).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // -----------------------------------------------------------------
  // Mutex: second concurrent call is a no-op
  // -----------------------------------------------------------------
  it("should bail out if already processing (mutex guard)", async () => {
    mockFetchExpiredLinks.mockResolvedValue([expiredLink()]);
    let releaseTx!: (hash: string) => void;
    mockSendTransactionAsync.mockReturnValue(
      new Promise<string>((r) => {
        releaseTx = r;
      }),
    );
    mockWaitForReceipt.mockResolvedValue({ status: "success", logs: [] });

    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    let firstCall: Promise<void> | undefined;
    act(() => {
      firstCall = result.current.processExpiredLinks(
        "0x1234567890123456789012345678901234567890",
      );
    });

    await waitFor(() => {
      expect(mockSendTransactionAsync).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.processExpiredLinks(
        "0x1234567890123456789012345678901234567890",
      );
    });
    expect(mockSendTransactionAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseTx("0xhash");
      await firstCall;
    });

    expect(result.current.refundedCount).toBe(1);
  });

  // -----------------------------------------------------------------
  // Indexer not configured → no-op
  // -----------------------------------------------------------------
  it("should no-op when the indexer is not configured", async () => {
    mockIsIndexerConfigured.mockReturnValue(false);
    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks(
        "0x1234567890123456789012345678901234567890",
      );
    });

    expect(result.current.refundedCount).toBe(0);
    expect(mockSendTransactionAsync).not.toHaveBeenCalled();
    expect(mockFetchExpiredLinks).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------
  // reset()
  // -----------------------------------------------------------------
  it("should reset refundedCount, error, and failedDepositIds", async () => {
    mockFetchExpiredLinks.mockResolvedValue([expiredLink()]);
    mockSendTransactionAsync.mockResolvedValue("0xhash");
    mockWaitForReceipt.mockResolvedValue({ status: "reverted", logs: [] });

    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks(
        "0x1234567890123456789012345678901234567890",
      );
    });
    expect(result.current.failedDepositIds.size).toBe(1);

    act(() => {
      result.current.reset();
    });

    expect(result.current.refundedCount).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.failedDepositIds.size).toBe(0);
  });

  // -----------------------------------------------------------------
  // Top-level error path (fetchExpiredLinks rejects)
  // -----------------------------------------------------------------
  it("should surface a top-level error when fetchExpiredLinks rejects", async () => {
    mockFetchExpiredLinks.mockRejectedValue(new Error("indexer down"));

    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks(
        "0x1234567890123456789012345678901234567890",
      );
    });

    expect(result.current.error).toBe("indexer down");
  });

  it("should surface a generic message for non-Error throws", async () => {
    mockFetchExpiredLinks.mockRejectedValue("string error");

    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks(
        "0x1234567890123456789012345678901234567890",
      );
    });

    expect(result.current.error).toBe(
      "Failed to load expired links from indexer",
    );
  });
});
