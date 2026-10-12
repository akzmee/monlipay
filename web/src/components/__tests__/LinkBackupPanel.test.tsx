import { StrictMode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { CreatedLinkBackup, LinkBackupPanel } from "../LinkBackupPanel";

const mock = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/lib/link-passkey", () => ({ supportsLinkPasskeys: () => true }));
vi.mock("../LinkBackupProvider", () => ({ useLinkBackups: () => mock.value }));
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  mock.value = {
    status: "setup",
    profile: null,
    passkey: null,
    enablePasskey: vi.fn().mockResolvedValue(undefined),
    unlockPasskey: vi.fn().mockResolvedValue(undefined),
    links: [],
    busy: false,
    error: "",
    pending: 0,
    scope: { owner: "0x1111111111111111111111111111111111111111" },
    setup: vi.fn().mockResolvedValue(undefined),
    saveLink: vi.fn().mockResolvedValue(undefined),
    lock: vi.fn(),
    unlock: vi.fn().mockResolvedValue(undefined),
  };
});
afterEach(() => vi.unstubAllGlobals());
describe("backup controls", () => {
  it("offers passkey setup without displaying or downloading a recovery key", async () => {
    render(<LinkBackupPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Use passkey" }));
    await waitFor(() =>
      expect(mock.value.enablePasskey).toHaveBeenCalledWith(),
    );
    expect(screen.queryByLabelText(/recovery key/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /download/i }),
    ).not.toBeInTheDocument();
  });
  it("opens existing saved links through the passkey action", async () => {
    mock.value.status = "locked";
    mock.value.profile = { vaultId: "test" };
    mock.value.passkey = { credentialId: "test" };
    render(<LinkBackupPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: "Unlock with passkey" }),
    );
    await waitFor(() =>
      expect(mock.value.unlockPasskey).toHaveBeenCalledTimes(1),
    );
  });
  it("retains the previous-key path only for existing legacy profiles", async () => {
    mock.value.status = "locked";
    mock.value.profile = { vaultId: "test" };
    render(<LinkBackupPanel />);
    fireEvent.change(screen.getByLabelText("Previous recovery key"), {
      target: { value: "previous-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Switch to passkey" }));
    await waitFor(() =>
      expect(mock.value.enablePasskey).toHaveBeenCalledWith("previous-key"),
    );
    expect(screen.getByLabelText("Previous recovery key")).toHaveValue("");
  });
  it("clears an original link left in the import form when backups lock", () => {
    mock.value.status = "unlocked";
    const { rerender } = render(<LinkBackupPanel />);
    fireEvent.change(screen.getByLabelText("Original Payment Link"), {
      target: { value: "private-link" },
    });
    mock.value.status = "locked";
    rerender(<LinkBackupPanel />);
    expect(screen.queryByDisplayValue("private-link")).not.toBeInTheDocument();
    mock.value.status = "unlocked";
    rerender(<LinkBackupPanel />);
    expect(screen.getByLabelText("Original Payment Link")).toHaveValue("");
  });
  it("auto-saves exactly once in Strict Mode and only reports success after acknowledgement", async () => {
    mock.value.status = "unlocked";
    mock.value.profile = { vaultId: "test" };
    let finish!: () => void;
    mock.value.saveLink = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <StrictMode>
        <CreatedLinkBackup url="https://monlipay.test/claim#1-test" />
      </StrictMode>,
    );
    await waitFor(() => expect(mock.value.saveLink).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText("Encrypting and saving your link…"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Saved to My Links\./)).not.toBeInTheDocument();
    await act(async () => {
      finish();
    });
    expect(screen.getByText(/Saved to My Links\./)).toBeInTheDocument();
  });
  it("offers retry and keeps the original-link warning after a failed backup", async () => {
    mock.value.status = "unlocked";
    mock.value.profile = { vaultId: "test" };
    mock.value.saveLink = vi
      .fn()
      .mockRejectedValue(
        new Error("Encrypted copy saved on this device, but not synced."),
      );
    render(<CreatedLinkBackup url="https://monlipay.test/claim#1-test" />);
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Retry saving" })).toBeEnabled();
    expect(screen.queryByText(/Saved to My Links\./)).not.toBeInTheDocument();
  });
});
