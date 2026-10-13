import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { encodeAbiParameters, encodeEventTopics, zeroAddress } from "viem";
import GroupPaymentForm from "@/components/GroupPaymentForm";
import { luckyVaultAbi } from "@/lib/lucky-abi";
import { SUPPORTED_TOKENS, type TokenInfo } from "@/config/chain";

const mocks = vi.hoisted(() => ({
  wallet: "0x2222222222222222222222222222222222222222",
  vault: "0x1111111111111111111111111111111111111111",
  equal: "0x4444444444444444444444444444444444444444",
  write: vi.fn(), wait: vi.fn(), readContract: vi.fn(), run: vi.fn(),
}));
const token: TokenInfo = { address: "0x3333333333333333333333333333333333333333", symbol: "USD", name: "Test Dollar", decimals: 6, isNative: false, logoURI: "/test-token.svg" };
vi.mock("wagmi", () => ({ useAccount: () => ({ address: mocks.wallet }), useReadContract: () => ({ data: 1000n }) }));
vi.mock("@rainbow-me/rainbowkit", () => ({ useConnectModal: () => ({ openConnectModal: vi.fn() }) }));
vi.mock("@/config/lucky", async (original) => ({ ...(await original<object>()), LUCKY_VAULT_ADDRESS: mocks.vault, isLuckyConfigured: true, supportsOpenLuckyLinks: () => true }));
vi.mock("@/config/group", async (original) => ({ ...(await original<object>()), GROUP_VAULT_ADDRESS: mocks.equal, isGroupConfigured: true, supportsOpenGroupLinks: () => true }));
vi.mock("@/hooks/useLuckyTransaction", () => ({ useLuckyTransaction: () => ({ run: mocks.run, busy: false, error: "", hash: undefined }) }));
vi.mock("@/hooks/useContacts", () => ({ useContacts: () => ({ unlocked: false, busy: false, contacts: [], unlock: vi.fn() }) }));
vi.mock("@/hooks/useTokenMetadata", () => ({ useTokenMetadata: () => ({ metadata: null, isLoading: false, isError: false }) }));
vi.mock("@/hooks/useTokenRegistry", () => ({ useTokenRegistry: () => ({ tokens: [SUPPORTED_TOKENS[0], token], customTokens: [], addToken: vi.fn(), removeToken: vi.fn() }) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.write.mockResolvedValue("0xabc");
  mocks.readContract.mockResolvedValue(0n);
  mocks.wait.mockResolvedValue({ logs: [mocks.equal, mocks.vault].map(address => ({ address,
    topics: encodeEventTopics({ abi: luckyVaultAbi, eventName: "PacketCreated", args: { packetId: 1n, sender: mocks.wallet as `0x${string}`, token: zeroAddress } }),
    data: encodeAbiParameters([{type:"uint256"},{type:"uint16"},{type:"uint40"}], [10n ** 18n, 10, 2000000000]),
  })) });
  mocks.run.mockImplementation(async (work) => work({ wallet: mocks.wallet, client: { readContract: mocks.readContract, getBlock: async () => ({ timestamp: 1900000000n }) }, write: mocks.write, wait: mocks.wait, stage: vi.fn() }));
});
const fill = () => {
  fireEvent.change(screen.getByLabelText("Payment title"), { target: { value: "Community giveaway" } });
  fireEvent.change(screen.getByLabelText("Total pool"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Number of recipients"), { target: { value: "10" } });
};

describe("Group creation modes and token selection", () => {
  it("funds an open giveaway without asking for recipient addresses", async () => {
    render(<GroupPaymentForm />); fill();
    expect(screen.getByRole("radio", {name:"Anyone"})).toBeChecked();
    expect(screen.getByRole("radio", {name:"Equal amount"})).toBeChecked();
    expect(screen.getByText("10 recipients · 0.1 MON each")).toBeInTheDocument();
    expect(screen.queryByText(/draw fee of/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Add wallet addresses")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fund & create link" }));
    await waitFor(() => expect(screen.getByLabelText("Share link")).toBeInTheDocument());
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ address: mocks.equal, functionName: "createOpenPacket", args: [zeroAddress, 10n ** 18n, 10, 1900086400, "Community giveaway"], value: 10n ** 18n }));
    expect((screen.getByLabelText("Share link") as HTMLInputElement).value).toContain(`vault=${mocks.equal}`);
  });
  it("keeps entered wallets when switching modes and funds the selected list", async () => {
    render(<GroupPaymentForm />); fill();
    fireEvent.change(screen.getByLabelText("Number of recipients"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("radio", {name:"Selected wallets"}));
    fireEvent.change(screen.getByLabelText("Add wallet addresses"), { target: { value: mocks.wallet } });
    fireEvent.click(screen.getByRole("button", {name:"Add wallet"}));
    await waitFor(() => expect(screen.getByText("1 selected")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("radio", {name:"Anyone"}));
    fireEvent.click(screen.getByRole("radio", {name:"Selected wallets"}));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fund & create link" }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ functionName: "createPacket", args: [zeroAddress, 10n ** 18n, 1, 1900086400, "Community giveaway", [mocks.wallet]] })));
  });
  it("searches tokens by address and uses ERC20 decimals without submitting from the modal", async () => {
    render(<GroupPaymentForm />); fill();
    fireEvent.click(screen.getByRole("button", {name:"Select token, MON"}));
    fireEvent.change(screen.getByPlaceholderText("Search name or paste address"), { target: { value: token.address } });
    fireEvent.click(screen.getByRole("button", {name:/USD Test Dollar/}));
    expect(mocks.write).not.toHaveBeenCalled();
    expect(screen.getByRole("button", {name:"Select token, USD"})).toBeInTheDocument();
    expect(screen.getByRole("link", {name:/Test Dollar/})).toHaveAttribute("title", token.address);
    fireEvent.click(screen.getByRole("button", { name: "Fund & create link" }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ address: mocks.equal, functionName: "createOpenPacket", args: [token.address, 1000000n, 10, 1900086400, "Community giveaway"], value: 0n })));
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ functionName: "approve", args: [mocks.equal, 1000000n] }));
  });
  it("uses the random vault after selecting Random amount", async () => {
    render(<GroupPaymentForm />); fill();
    fireEvent.click(screen.getByRole("radio", {name:"Random amount"}));
    expect(screen.queryByText("10 recipients · 0.1 MON each")).not.toBeInTheDocument();
    expect(screen.getByText(/draw fee of/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name:"Fund & create link"}));
    await waitFor(() => expect(screen.getByLabelText("Share link")).toBeInTheDocument());
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({address:mocks.vault,functionName:"createOpenPacket"}));
    expect((screen.getByLabelText("Share link") as HTMLInputElement).value).toContain(`vault=${mocks.vault}`);
  });
  it("blocks indivisible equal pools without opening a wallet transaction", () => {
    render(<GroupPaymentForm />); fill();
    fireEvent.change(screen.getByLabelText("Number of recipients"), {target:{value:"3"}});
    expect(screen.getByText(/This pool cannot split evenly/)).toBeInTheDocument();
    expect(screen.getByRole("button", {name:"Fund & create link"})).toBeDisabled();
    expect(mocks.run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", {name:"Random amount"}));
    expect(screen.getByRole("button", {name:"Fund & create link"})).toBeEnabled();
  });

});
