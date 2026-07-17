import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Mock wagmi's useReadContracts
const mockUseReadContracts = vi.fn();
vi.mock("wagmi", () => ({
  useReadContracts: (...args: unknown[]) => mockUseReadContracts(...args),
}));

// Mock isAddress from viem
vi.mock("viem", () => ({
  isAddress: (addr: string) => /^0x[0-9a-fA-F]{40}$/.test(addr),
}));

import { useTokenMetadata } from "@/hooks/useTokenMetadata";

describe("useTokenMetadata", () => {
  beforeEach(() => {
    mockUseReadContracts.mockReset();
    mockUseReadContracts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  it("should return null metadata for null address", () => {
    const { result } = renderHook(() => useTokenMetadata(null));
    expect(result.current.metadata).toBeNull();
  });

  it("should return null metadata for empty string", () => {
    const { result } = renderHook(() => useTokenMetadata(""));
    expect(result.current.metadata).toBeNull();
  });

  it("should return null metadata for zero address (native token)", () => {
    const { result } = renderHook(() =>
      useTokenMetadata("0x0000000000000000000000000000000000000000"),
    );
    expect(result.current.metadata).toBeNull();
  });

  it("should return null metadata for invalid address", () => {
    const { result } = renderHook(() => useTokenMetadata("not-an-address"));
    expect(result.current.metadata).toBeNull();
  });

  it("should return null metadata when data is undefined", () => {
    mockUseReadContracts.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    const { result } = renderHook(() =>
      useTokenMetadata("0x1234567890123456789012345678901234567890"),
    );
    expect(result.current.metadata).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it("should return parsed metadata when all three reads succeed", () => {
    mockUseReadContracts.mockReturnValue({
      data: [
        { status: "success", result: "USD Coin" },
        { status: "success", result: "USDC" },
        { status: "success", result: 6 },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    const { result } = renderHook(() =>
      useTokenMetadata("0x1234567890123456789012345678901234567890"),
    );

    expect(result.current.metadata).toEqual({
      address: "0x1234567890123456789012345678901234567890",
      name: "USD Coin",
      symbol: "USDC",
      decimals: 6,
      isNative: false,
    });
  });

  it("should return null metadata when one read fails", () => {
    mockUseReadContracts.mockReturnValue({
      data: [
        { status: "success", result: "USD Coin" },
        { status: "failure", error: new Error("revert") },
        { status: "success", result: 6 },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    const { result } = renderHook(() =>
      useTokenMetadata("0x1234567890123456789012345678901234567890"),
    );

    expect(result.current.metadata).toBeNull();
  });

  it("should pass isNative: false in metadata", () => {
    mockUseReadContracts.mockReturnValue({
      data: [
        { status: "success", result: "Test" },
        { status: "success", result: "TST" },
        { status: "success", result: 18 },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    const { result } = renderHook(() =>
      useTokenMetadata("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"),
    );

    expect(result.current.metadata?.isNative).toBe(false);
  });

  it("should expose isError when hook reports error", () => {
    mockUseReadContracts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      // wagmi's error type is a complex union; cast for test purposes
      error: new Error("network error") as never,
    });

    const { result } = renderHook(() =>
      useTokenMetadata("0x1234567890123456789012345678901234567890"),
    );

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBeDefined();
  });
});
