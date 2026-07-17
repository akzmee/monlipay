import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";

// --- Mocks (module-scope so the hook resolves them via dynamic imports) ---

const mockSendTransactionAsync = vi.fn();
const mockWaitForReceipt = vi.fn();
const mockGetStoredLinks = vi.fn<() => unknown[]>(() => []);
const mockUpdateStoredLinkStatus = vi.fn();

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

vi.mock("@/lib/storage", () => ({
  getStoredLinks: () => mockGetStoredLinks(),
  updateStoredLinkStatus: (...args: unknown[]) =>
    mockUpdateStoredLinkStatus(...args),
  addStoredLink: vi.fn(),
  removeStoredLink: vi.fn(),
}));

vi.mock("@/config/chain", () => ({
  LINK_VAULT_ADDRESS: "0xvault" as `0x${string}`,
  monadChain: { id: 10143 },
}));

vi.mock("@/lib/abi", () => ({ linkVaultAbi: [] }));

// Helper to build an expired link owned by the mocked address.
function expiredLink(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    depositId: "1",
    token: "0x0000000000000000000000000000000000000000",
    amount: "1.0",
    // 1 hour ago → always expired
    expiry: Math.floor(Date.now() / 1000) - 3600,
    createdAt: Math.floor(Date.now() / 1000) - 7200,
    sender: "0x1234567890123456789012345678901234567890",
    ...overrides,
  };
}

describe("useAutoRefundExpiredLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStoredLinks.mockReturnValue([]);
    mockSendTransactionAsync.mockReset();
    mockWaitForReceipt.mockReset();
    mockUpdateStoredLinkStatus.mockReset();
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
    mockGetStoredLinks.mockReturnValue([]);
    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks();
    });

    expect(result.current.refundedCount).toBe(0);
    expect(mockSendTransactionAsync).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------
  // Happy path: one expired link → refunded
  // -----------------------------------------------------------------
  it("should refund an expired link and update status", async () => {
    mockGetStoredLinks.mockReturnValue([expiredLink()]);
    mockSendTransactionAsync.mockResolvedValue("0xhash");
    mockWaitForReceipt.mockResolvedValue({ status: "success", logs: [] });

    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks();
    });

    expect(result.current.refundedCount).toBe(1);
    expect(result.current.failedDepositIds.size).toBe(0);
    expect(result.current.error).toBeNull();
    expect(mockUpdateStoredLinkStatus).toHaveBeenCalledWith("1", "refunded");
  });

  // -----------------------------------------------------------------
  // Reverted receipt → per-link failure
  // -----------------------------------------------------------------
  it("should record a per-link failure when receipt reverts", async () => {
    mockGetStoredLinks.mockReturnValue([expiredLink()]);
    mockSendTransactionAsync.mockResolvedValue("0xhash");
    mockWaitForReceipt.mockResolvedValue({ status: "reverted", logs: [] });

    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks();
    });

    expect(result.current.refundedCount).toBe(0);
    expect(result.current.failedDepositIds.has("1")).toBe(true);
    // Top-level error appears because ALL links failed
    expect(result.current.error).toContain("Could not auto-refund");
  });

  // -----------------------------------------------------------------
  // sendTransactionAsync throws → per-link failure
  // -----------------------------------------------------------------
  it("should record a per-link failure when sendTransaction throws", async () => {
    mockGetStoredLinks.mockReturnValue([expiredLink()]);
    mockSendTransactionAsync.mockRejectedValue(new Error("Nonce too low"));

    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks();
    });

    expect(result.current.refundedCount).toBe(0);
    expect(result.current.failedDepositIds.has("1")).toBe(true);
  });

  // -----------------------------------------------------------------
  // Partial failure: 1 success + 1 failure
  // -----------------------------------------------------------------
  it("should surface partial failures without top-level error", async () => {
    mockGetStoredLinks.mockReturnValue([
      expiredLink({ depositId: "1" }),
      expiredLink({ depositId: "2" }),
    ]);
    // First tx succeeds, second throws
    mockSendTransactionAsync
      .mockResolvedValueOnce("0xhash1")
      .mockRejectedValueOnce(new Error("rejected"));
    mockWaitForReceipt.mockResolvedValue({ status: "success", logs: [] });

    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks();
    });

    expect(result.current.refundedCount).toBe(1);
    expect(result.current.failedDepositIds.has("2")).toBe(true);
    expect(result.current.failedDepositIds.has("1")).toBe(false);
    // Partial failure → no top-level error
    expect(result.current.error).toBeNull();
  });

  // -----------------------------------------------------------------
  // Mutex: second concurrent call is a no-op
  // -----------------------------------------------------------------
  it("should bail out if already processing (mutex guard)", async () => {
    mockGetStoredLinks.mockReturnValue([expiredLink()]);
    let releaseTx!: (hash: string) => void;
    mockSendTransactionAsync.mockReturnValue(
      new Promise<string>((r) => {
        releaseTx = r;
      }),
    );
    mockWaitForReceipt.mockResolvedValue({ status: "success", logs: [] });

    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    // Kick off the first call but don't release the tx hash yet.
    let firstCall: Promise<void> | undefined;
    act(() => {
      firstCall = result.current.processExpiredLinks();
    });

    // Wait for the first call to hit the pending sendTransactionAsync
    await waitFor(() => {
      expect(mockSendTransactionAsync).toHaveBeenCalledTimes(1);
    });

    // While the first is still in flight, invoke again — should be a no-op
    await act(async () => {
      await result.current.processExpiredLinks();
    });
    expect(mockSendTransactionAsync).toHaveBeenCalledTimes(1);

    // Now release the tx hash so the first call can complete
    await act(async () => {
      releaseTx("0xhash");
      await firstCall;
    });

    expect(result.current.refundedCount).toBe(1);
  });

  // -----------------------------------------------------------------
  // Filters: not-yet-expired, already-refunded, already-claimed, other sender
  // -----------------------------------------------------------------
  it("should skip not-yet-expired links", async () => {
    mockGetStoredLinks.mockReturnValue([
      expiredLink({ expiry: Math.floor(Date.now() / 1000) + 3600 }),
    ]);
    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks();
    });

    expect(mockSendTransactionAsync).not.toHaveBeenCalled();
    expect(result.current.refundedCount).toBe(0);
  });

  it("should skip already-refunded links", async () => {
    mockGetStoredLinks.mockReturnValue([
      expiredLink({ status: "refunded" }),
    ]);
    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks();
    });

    expect(mockSendTransactionAsync).not.toHaveBeenCalled();
  });

  it("should skip already-claimed links", async () => {
    mockGetStoredLinks.mockReturnValue([
      expiredLink({ status: "claimed" }),
    ]);
    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks();
    });

    expect(mockSendTransactionAsync).not.toHaveBeenCalled();
  });

  it("should skip links owned by a different sender", async () => {
    mockGetStoredLinks.mockReturnValue([
      expiredLink({ sender: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" }),
    ]);
    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks();
    });

    expect(mockSendTransactionAsync).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------
  // reset()
  // -----------------------------------------------------------------
  it("should reset refundedCount, error, and failedDepositIds", async () => {
    mockGetStoredLinks.mockReturnValue([expiredLink()]);
    mockSendTransactionAsync.mockResolvedValue("0xhash");
    mockWaitForReceipt.mockResolvedValue({ status: "reverted", logs: [] });

    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks();
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
  // Top-level error path (e.g. dynamic import fails)
  // -----------------------------------------------------------------
  it("should surface a top-level error when an unexpected exception occurs", async () => {
    // Force the inner try block to throw by making getStoredLinks throw.
    // The hook wraps the whole batch in try/catch.
    mockGetStoredLinks.mockImplementation(() => {
      throw new Error("storage corrupted");
    });

    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks();
    });

    expect(result.current.error).toBe("storage corrupted");
  });

  it("should surface a generic message for non-Error throws", async () => {
    mockGetStoredLinks.mockImplementation(() => {
      throw "string error"; // eslint-disable-line no-throw-literal
    });

    const { useAutoRefundExpiredLinks } = await import("@/hooks/useLinkVault");
    const { result } = renderHook(() => useAutoRefundExpiredLinks());

    await act(async () => {
      await result.current.processExpiredLinks();
    });

    expect(result.current.error).toBe("Failed to auto-refund expired links");
  });
});
