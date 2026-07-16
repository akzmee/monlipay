import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRefundMultiple } from "@/hooks/useRefundMultiple";

// Mock the underlying useRefundLink hook
const mockRefund = vi.fn();
const mockReset = vi.fn();

vi.mock("@/hooks/useLinkVault", () => ({
  useRefundLink: () => ({
    refund: mockRefund,
    isSending: false,
    isConfirming: false,
    isSuccess: false,
    error: null,
    reset: mockReset,
  }),
}));

describe("useRefundMultiple", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize with empty busyDepositIds", () => {
    const { result } = renderHook(() => useRefundMultiple());
    expect(result.current.busyDepositIds).toBeInstanceOf(Set);
    expect(result.current.busyDepositIds.size).toBe(0);
  });

  it("should expose refundMultiple function", () => {
    const { result } = renderHook(() => useRefundMultiple());
    expect(typeof result.current.refundMultiple).toBe("function");
  });

  it("should expose isSending, isConfirming, isSuccess, error, reset", () => {
    const { result } = renderHook(() => useRefundMultiple());
    expect(result.current.isSending).toBe(false);
    expect(result.current.isConfirming).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.reset).toBe("function");
  });

  it("should mark depositId as busy when refund starts", async () => {
    mockRefund.mockImplementation(() => new Promise(() => {})); // Never resolves
    const { result } = renderHook(() => useRefundMultiple());

    act(() => {
      result.current.refundMultiple(42n);
    });

    expect(result.current.busyDepositIds.has("42")).toBe(true);
  });

  it("should remove depositId from busy after refund succeeds", async () => {
    mockRefund.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRefundMultiple());

    await act(async () => {
      await result.current.refundMultiple(99n);
    });

    expect(result.current.busyDepositIds.has("99")).toBe(false);
  });

  it("should call onSuccess callback after successful refund", async () => {
    mockRefund.mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useRefundMultiple());

    await act(async () => {
      await result.current.refundMultiple(5n, onSuccess);
    });

    expect(onSuccess).toHaveBeenCalled();
  });

  it("should remove depositId from busy even if refund fails", async () => {
    mockRefund.mockRejectedValue(new Error("Transaction failed"));
    const { result } = renderHook(() => useRefundMultiple());

    await act(async () => {
      try {
        await result.current.refundMultiple(1n);
      } catch {
        // Expected
      }
    });

    expect(result.current.busyDepositIds.has("1")).toBe(false);
  });

  it("should handle multiple concurrent refunds with different IDs", async () => {
    mockRefund.mockResolvedValue(undefined);
    const { result } = renderHook(() => useRefundMultiple());

    await act(async () => {
      await Promise.all([
        result.current.refundMultiple(1n),
        result.current.refundMultiple(2n),
        result.current.refundMultiple(3n),
      ]);
    });

    expect(result.current.busyDepositIds.size).toBe(0);
  });
});
