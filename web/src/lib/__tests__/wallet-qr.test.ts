import { describe, expect, it } from "vitest";
import { create } from "cuer/QrCode";

describe("WalletConnect QR compatibility", () => {
  it("encodes a pairing URI through the renderer used by RainbowKit", () => {
    // Cuer requests a borderless grid and draws its own quiet zone. qr >= 0.6
    // rejects border: 0 and crashes the wallet modal; keep the scoped override.
    const uri = `wc:${"ab".repeat(32)}@2?relay-protocol=irn&symKey=${"cd".repeat(32)}`;
    const code = create(uri, { errorCorrection: "medium" });
    expect(code.value).toBe(uri);
    expect(code.edgeLength).toBeGreaterThan(21);
    expect(code.grid).toHaveLength(code.edgeLength);
    expect(code.grid.every((row) => row.length === code.edgeLength)).toBe(true);
    expect(code.grid.flat().every((cell) => typeof cell === "boolean")).toBe(true);
  });
});
