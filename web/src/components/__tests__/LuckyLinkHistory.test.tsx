import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { zeroAddress } from "viem";
import { LuckyLinkHistory } from "@/components/LuckyLinkHistory";

const state = vi.hoisted(() => ({
  current: "0x1111111111111111111111111111111111111111",
  legacy: "0x2222222222222222222222222222222222222222",
  owner: "0x3333333333333333333333333333333333333333" as `0x${string}`,
  failed: false,
}));
vi.mock("@/config/lucky", async (original) => ({ ...(await original<object>()), LUCKY_VAULTS: [state.current, state.legacy] }));
vi.mock("wagmi", () => ({
  useReadContracts: () => ({ data: [state.failed ? {status:"failure",error:new Error("RPC")} : {status:"success",result:[1n]}, {status:"success",result:[1n]}], refetch: vi.fn(), isError:false, isPending:false }),
  useReadContract: ({address}: {address:string}) => ({ data: { sender: state.owner, token: zeroAddress, total: 10n ** 18n, remaining: 10n ** 18n, expiry:2000000000, slots:10, requested:0, settled:0, closed:false, title: address === state.current ? "New giveaway" : "Earlier giveaway" } }),
}));
beforeEach(() => { state.failed = false; });

describe("Lucky history across contract versions", () => {
  it("keeps identically numbered old and new packets as distinct links", () => {
    render(<LuckyLinkHistory address={state.owner} now={1900000000} />);
    expect(screen.getByText("New giveaway")).toBeInTheDocument();
    expect(screen.getByText("Earlier giveaway")).toBeInTheDocument();
    const links=screen.getAllByRole("link", {name:/View link/});
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toContain(`vault=${state.current}`);
    expect(links[1].getAttribute("href")).toContain(`vault=${state.legacy}`);
  });
  it("keeps legacy records accessible if the newer query fails", () => {
    state.failed = true;
    render(<LuckyLinkHistory address={state.owner} now={1900000000} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Some Lucky Links could not be loaded");
    expect(screen.getByText("Earlier giveaway")).toBeInTheDocument();
    expect(screen.getByRole("link", {name:/View link/}).getAttribute("href")).toContain(`vault=${state.legacy}`);
  });
});
