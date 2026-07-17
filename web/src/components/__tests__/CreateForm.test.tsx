import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CreateForm } from "@/components/CreateForm";
import { SUPPORTED_TOKENS, EXPIRY_PRESETS } from "@/config/chain";

// Mock useTokenMetadata to avoid needing WagmiProvider in tests
vi.mock("@/hooks/useTokenMetadata", () => ({
  useTokenMetadata: () => ({
    metadata: null,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

// Mock useTokenRegistry to avoid needing WagmiProvider in tests
vi.mock("@/hooks/useTokenRegistry", () => ({
  useTokenRegistry: () => ({
    tokens: SUPPORTED_TOKENS,
    customTokens: [],
    addToken: vi.fn(),
    removeToken: vi.fn(),
  }),
}));

function renderCreateForm(
  overrides: Partial<Parameters<typeof CreateForm>[0]> = {},
) {
  const props = {
    amount: "",
    setAmount: vi.fn(),
    selectedToken: SUPPORTED_TOKENS[0],
    setSelectedToken: vi.fn(),
    expirySeconds: EXPIRY_PRESETS[2].value,
    setExpirySeconds: vi.fn(),
    onCreate: vi.fn(),
    isBusy: false,
    error: null,
    ...overrides,
  };
  return { ...render(<CreateForm {...props} />), props };
}

describe("CreateForm", () => {
  it("should render the token selector button showing current token", () => {
    renderCreateForm();
    // The token selector button shows the symbol "MON"
    expect(screen.getByText("MON")).toBeInTheDocument();
  });

  it("should render the amount input", () => {
    renderCreateForm();
    expect(screen.getByPlaceholderText("0.0")).toBeInTheDocument();
  });

  it("should render the expiry presets", () => {
    renderCreateForm();
    expect(screen.getByText("1 hour")).toBeInTheDocument();
    expect(screen.getByText("7 days")).toBeInTheDocument();
  });

  it("should render the create button", () => {
    renderCreateForm();
    expect(screen.getByText("Create Payment Link")).toBeInTheDocument();
  });

  it("should disable create button when amount is empty", () => {
    renderCreateForm({ amount: "" });
    expect(screen.getByText("Create Payment Link")).toBeDisabled();
  });

  it("should disable create button when amount is 0", () => {
    renderCreateForm({ amount: "0" });
    expect(screen.getByText("Create Payment Link")).toBeDisabled();
  });

  it("should disable create button when amount is negative", () => {
    renderCreateForm({ amount: "-1" });
    expect(screen.getByText("Create Payment Link")).toBeDisabled();
  });

  it("should enable create button when amount is valid", () => {
    renderCreateForm({ amount: "1.5" });
    expect(screen.getByText("Create Payment Link")).not.toBeDisabled();
  });

  it("should show busy state on button when isBusy", () => {
    renderCreateForm({ amount: "1", isBusy: true });
    expect(screen.getByText("Confirming...")).toBeInTheDocument();
  });

  it("should display error message", () => {
    renderCreateForm({ error: "Transaction failed" });
    expect(screen.getByText("Transaction failed")).toBeInTheDocument();
  });

  it("should call setAmount when typing", () => {
    const { props } = renderCreateForm();
    const input = screen.getByPlaceholderText("0.0");
    fireEvent.change(input, { target: { value: "5" } });
    expect(props.setAmount).toHaveBeenCalledWith("5");
  });

  it("should call onCreate when button is clicked", () => {
    const { props } = renderCreateForm({ amount: "1.5" });
    fireEvent.click(screen.getByText("Create Payment Link"));
    expect(props.onCreate).toHaveBeenCalled();
  });

  it("should call setExpirySeconds when preset is clicked", () => {
    const { props } = renderCreateForm();
    fireEvent.click(screen.getByText("1 hour"));
    expect(props.setExpirySeconds).toHaveBeenCalledWith(3600);
  });

  it("should highlight the selected expiry preset", () => {
    renderCreateForm({ expirySeconds: EXPIRY_PRESETS[0].value });
    const presetButton = screen.getByText("1 hour").closest("button");
    expect(presetButton?.className).toContain("violet");
  });

  it("should disable inputs when busy", () => {
    renderCreateForm({ amount: "1", isBusy: true });
    expect(screen.getByPlaceholderText("0.0")).toBeDisabled();
    // Expiry buttons should also be disabled
    expect(screen.getByText("1 hour").closest("button")).toBeDisabled();
  });

  it("should open token modal when selector is clicked", () => {
    renderCreateForm();
    // The token selector button contains "MON"
    const tokenButton = screen.getByText("MON").closest("button");
    fireEvent.click(tokenButton!);
    // Modal should appear with "Select a token" header
    expect(screen.getByText("Select a token")).toBeInTheDocument();
  });
});
