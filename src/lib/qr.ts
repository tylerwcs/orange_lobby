import QRCode from "qrcode";

export function qrPngBuffer(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, { type: "png", width: 600, margin: 2, errorCorrectionLevel: "M" });
}
export function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { width: 320, margin: 2, errorCorrectionLevel: "M" });
}
