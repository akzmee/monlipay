import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTokenRegistry } from "@/hooks/useTokenRegistry";
import * as tokenStorage from "@/lib/tokenStorage";
import type { TokenInfo } from "@/config/chain";

// Mock tokenStorage
vi.mock("@/lib/tokenStorage", () => ({
  getCustomTokens: vi.fn(),
  addCustomToken: vi.fn(),
  removeCustomToken: vi.fn(),
}));

describe("useTokenRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tokenStorage.getCustomTokens).mockReturnValue([]);
  });

  it("should start with only SUPPORTED_TOKENS", () => {
    const { result } = renderHook(() => useTokenRegistry());
    // Wait for effect to run
    expect(result.current.tokens.length).toBeGreaterThanOrEqual(1);
    expect(result.current.customTokens).toEqual([]);
  });

  it("should load custom tokens from localStorage on mount", () => {
    const customTokens: TokenInfo[] = [
      {
        symbol: "USDC",
        name: "USD Coin",
        address: "0x1234567890123456789012345678901234567890",
        decimals: 6,
        isNative: false,
      },
    ];
    vi.mocked(tokenStorage.getCustomTokens).mockReturnValue(customTokens);

    const { result } = renderHook(() => useTokenRegistry());
    expect(result.current.customTokens).toEqual(customTokens);
    expect(result.current.tokens).toContain(customTokens[0]);
  });

  it("should call addCustomToken when addToken is called", () => {
    const { result } = renderHook(() => useTokenRegistry());
    const newToken: TokenInfo = {
      symbol: "TEST",
      name: "Test Token",
      address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      decimals: 18,
      isNative: false,
    };

    act(() => {
      result.current.addToken(newToken);
    });

    expect(tokenStorage.addCustomToken).toHaveBeenCalledWith(newToken);
    expect(tokenStorage.getCustomTokens).toHaveBeenCalled();
  });

  it("should update customTokens state after addToken", () => {
    const newToken: TokenInfo = {
      symbol: "TEST",
      name: "Test Token",
      address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      decimals: 18,
      isNative: false,
    };
    vi.mocked(tokenStorage.getCustomTokens)
      .mockReturnValueOnce([]) // initial
      .mockReturnValueOnce([newToken]); // after add

    const { result } = renderHook(() => useTokenRegistry());

    act(() => {
      result.current.addToken(newToken);
    });

    expect(result.current.customTokens).toEqual([newToken]);
  });

  it("should call removeCustomToken when removeToken is called", () => {
    const { result } = renderHook(() => useTokenRegistry());
    const addr = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

    act(() => {
      result.current.removeToken(addr);
    });

    expect(tokenStorage.removeCustomToken).toHaveBeenCalledWith(addr);
  });

  it("should update state after removeToken", () => {
    const token: TokenInfo = {
      symbol: "TEST",
      name: "Test",
      address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      decimals: 18,
      isNative: false,
    };
    vi.mocked(tokenStorage.getCustomTokens)
      .mockReturnValueOnce([token]) // initial
      .mockReturnValueOnce([]); // after remove

    const { result } = renderHook(() => useTokenRegistry());

    act(() => {
      result.current.removeToken(token.address);
    });

    expect(result.current.customTokens).toEqual([]);
  });

  it("should merge SUPPORTED_TOKENS with custom tokens", () => {
    const custom: TokenInfo = {
      symbol: "FOO",
      name: "Foo",
      address: "0x0000000000000000000000000000000000000001",
      decimals: 18,
      isNative: false,
    };
    vi.mocked(tokenStorage.getCustomTokens).mockReturnValue([custom]);

    const { result } = renderHook(() => useTokenRegistry());

    // SUPPORTED_TOKENS includes MON at minimum
    const hasMON = result.current.tokens.some((t) => t.symbol === "MON");
    expect(hasMON).toBe(true);
    expect(result.current.tokens).toContain(custom);
  });
});
