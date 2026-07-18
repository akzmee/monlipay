import { describe, it, expect, vi, beforeEach } from "vitest";
import { downloadQrPng, downloadQrSvg } from "@/lib/qr-download";

// jsdom doesn't implement CanvasRenderingContext2D — stub a permissive one.
const ctxStub = {
  fillRect: vi.fn(),
  drawImage: vi.fn(),
  fillStyle: "",
  strokeStyle: "",
  scale: vi.fn(),
  translate: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  arcTo: vi.fn(),
  closePath: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  rect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  setTransform: vi.fn(),
  rotate: vi.fn(),
  transform: vi.fn(),
  getImageData: vi.fn(() => ({ data: [] })),
  putImageData: vi.fn(),
  createImageData: vi.fn(() => ({ data: [] })),
} as unknown as CanvasRenderingContext2D;

// Spy on Blob so SVG tests can inspect the serialized content.
// `vi.fn(() => ...)` cannot be invoked with `new` — use a class instead.
const BlobMock = vi.fn();
class BlobStub {
  constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
    BlobMock(parts, opts);
    this.size = 0;
    this.type = opts?.type ?? "";
  }
  size: number;
  type: string;
}
beforeEach(() => {
  vi.stubGlobal("Blob", BlobStub);
  BlobMock.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxStub);
  HTMLCanvasElement.prototype.toDataURL = vi.fn(
    () => "data:image/png;base64,FAKE",
  );
  const clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  // Reset call history between tests within this file.
  clickSpy.mockClear();
  // Blob URLs normally resolve in the browser; stub to a fake URL.
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
});

describe("qr-download", () => {
  describe("downloadQrPng", () => {
    it("should no-op when canvas is null", () => {
      downloadQrPng(null);
      expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    });

    it("should create an anchor with the default PNG filename and trigger click", () => {
      const canvas = document.createElement("canvas");
      downloadQrPng(canvas);
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
      const anchor = (
        HTMLAnchorElement.prototype.click as any
      ).mock.instances.at(-1) as HTMLAnchorElement;
      expect(anchor?.download).toBe("monlipay-claim.png");
      expect(anchor?.href).toContain("data:image/png");
    });

    it("should accept a custom filename", () => {
      const canvas = document.createElement("canvas");
      downloadQrPng(canvas, "custom.png");
      const anchor = (
        HTMLAnchorElement.prototype.click as any
      ).mock.instances.at(-1) as HTMLAnchorElement;
      expect(anchor?.download).toBe("custom.png");
    });
  });

  describe("downloadQrSvg", () => {
    it("should no-op when svg element is null", () => {
      downloadQrSvg(null);
      expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    });

    it("should create an anchor with the default SVG filename and trigger click", () => {
      const svg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      downloadQrSvg(svg);
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
      const anchor = (
        HTMLAnchorElement.prototype.click as any
      ).mock.instances.at(-1) as HTMLAnchorElement;
      expect(anchor?.download).toBe("monlipay-claim.svg");
      expect(anchor?.href).toContain("blob:");
    });

    it("should accept a custom filename", () => {
      const svg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      downloadQrSvg(svg, "qr.svg");
      const anchor = (
        HTMLAnchorElement.prototype.click as any
      ).mock.instances.at(-1) as HTMLAnchorElement;
      expect(anchor?.download).toBe("qr.svg");
    });

    it("should insert a white background rect as the first child of the cloned svg", () => {
      const svg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      // Pre-existing child to verify background is inserted before it.
      const existing = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      svg.appendChild(existing);

      downloadQrSvg(svg);

      // Verify the serialized output passed to Blob contains the bg rect.
      expect(BlobMock).toHaveBeenCalled();
      const blobArg = BlobMock.mock.calls[0]?.[0]?.[0] as string | undefined;
      expect(blobArg).toBeDefined();
      expect(blobArg).toContain('fill="#ffffff"');
    });
  });
});
