/**
 * QR code download helpers — shared by ShareLink (post-create screen) and
 * LinkCard (my-links page). Both want PNG + SVG export of the same QR code,
 * so we centralize the canvas/SVG manipulation here.
 *
 * The PNG path renders at 512×512 with 32px white padding so the code scans
 * reliably against any background (dark mode, colored chat bubbles, print).
 * The SVG path wraps the QR in a white background rect for the same reason.
 */

const PNG_SIZE = 512;
const PNG_PADDING = 32;

/**
 * Export the given canvas (a rendered QRCodeCanvas) as a PNG download.
 * No-ops if the canvas is missing (e.g. the hidden export canvas hasn't
 * mounted yet).
 */
export function downloadQrPng(
  sourceCanvas: HTMLCanvasElement | null,
  filename = "monlipay-claim.png",
): void {
  if (!sourceCanvas) return;

  const out = document.createElement("canvas");
  out.width = PNG_SIZE;
  out.height = PNG_SIZE;
  const ctx = out.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PNG_SIZE, PNG_SIZE);
  ctx.drawImage(
    sourceCanvas,
    PNG_PADDING,
    PNG_PADDING,
    PNG_SIZE - PNG_PADDING * 2,
    PNG_SIZE - PNG_PADDING * 2,
  );

  const dataUrl = out.toDataURL("image/png");
  triggerDownload(dataUrl, filename);
}

/**
 * Export the given SVG element (a rendered QRCodeSVG) as an SVG file
 * download. Clones the node so the displayed QR is not mutated.
 */
export function downloadQrSvg(
  svgEl: SVGElement | null,
  filename = "monlipay-claim.svg",
): void {
  if (!svgEl) return;

  const clone = svgEl.cloneNode(true) as SVGElement;
  const xmlns = "http://www.w3.org/2000/svg";

  // Background rect as the first child so it sits behind the QR modules.
  const bg = document.createElementNS(xmlns, "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(bg, clone.firstChild);

  const svgString = new XMLSerializer().serializeToString(clone);
  const blob = new Blob(
    [`<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`],
    { type: "image/svg+xml" },
  );
  const urlObj = URL.createObjectURL(blob);
  triggerDownload(urlObj, filename);
  // Revoke on the next tick so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(urlObj), 0);
}

function triggerDownload(href: string, filename: string): void {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
