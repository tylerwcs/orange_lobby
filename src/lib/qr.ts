import QRCode from "qrcode";

/** `width` in px: 600 suits a badge; a poster's QR wants more (D491). */
export function qrPngBuffer(text: string, width = 600): Promise<Buffer> {
  return QRCode.toBuffer(text, { type: "png", width, margin: 2, errorCorrectionLevel: "M" });
}
export function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { width: 320, margin: 2, errorCorrectionLevel: "M" });
}
