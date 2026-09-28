/**
 * Shrinks a photo in the browser before a submission form sends it. A phone camera's full
 * resolution photo is routinely 5-10 MB, over Vercel's 4.5 MB request cap (see MAX_UPLOAD_BYTES),
 * and nobody reading an InBody sheet or a receipt needs 12 megapixels of it.
 */

/** Long edge after shrinking: small print on a full A4 scan is still readable at this size. */
export const SHRINK_EDGE = 2400;

/** An image already this small is sent as it is: re-encoding it would only lose detail. */
export const SHRINK_ABOVE_BYTES = 1.5 * 1024 * 1024;

const SHRINKABLE = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function shouldShrink(file: { type: string; size: number }): boolean {
  return SHRINKABLE.has(file.type.toLowerCase()) && file.size > SHRINK_ABOVE_BYTES;
}

/**
 * A JPEG no longer than SHRINK_EDGE on its long side, or the original file when it needs no
 * shrinking, the browser cannot decode it, or the result would not be smaller. Never throws: the
 * server's size check still stands behind whatever this hands back.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!shouldShrink(file)) return file;
  try {
    // createImageBitmap applies the photo's EXIF rotation, so a portrait shot stays upright.
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitWithin(bitmap.width, bitmap.height, SHRINK_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // JPEG has no transparency; a transparent PNG would otherwise come out on black.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]*$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
