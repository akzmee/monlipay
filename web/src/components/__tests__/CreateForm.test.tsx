import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateForm } from "@/components/CreateForm";
import { SUPPORTED_TOKENS, EXPIRY_PRESETS } from "@/config/chain";

function renderCreateForm(overrides: Partial<Parameters<typeof CreateForm>[0]> = {}) {
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
  it("should render the token selector", () => {
    renderCreateForm();
    // MON appears in token button and as suffix — use getAllByText
    expect(screen.getAllByText("MON").length).toBeGreaterThanOrEqual(1);
  });

  it("should render the amount input", () => {
    renderCreateForm();
    expect(screen.getByPlaceholderText("0.1")).toBeInTheDocument();
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
    const input = screen.getByPlaceholderText("0.1");
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

  it("should highlight the selected token", () => {
    renderCreateForm({ selectedToken: SUPPORTED_TOKENS[0] });
    // The token button contains "MON"
    const tokenButtons = screen.getAllByText("MON");
    const tokenButton = tokenButtons.find(
      (el) => el.tagName === "BUTTON" || el.closest("button"),
    );
    const button = tokenButton?.closest("button");
    expect(button?.className).toContain("red");
  });

  it("should highlight the selected expiry preset", () => {
    renderCreateForm({ expirySeconds: EXPIRY_PRESETS[0].value });
    const presetButton = screen.getByText("1 hour").closest("button");
    expect(presetButton?.className).toContain("red");
  });

  it("should disable inputs when busy", () => {
    renderCreateForm({ amount: "1", isBusy: true });
    expect(screen.getByPlaceholderText("0.1")).toBeDisabled();
    // Expiry buttons should also be disabled
    expect(screen.getByText("1 hour").closest("button")).toBeDisabled();
  });
});
