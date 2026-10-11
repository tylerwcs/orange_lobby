import { fitWithin } from "@/lib/shrink-image";
import { MAX_POLAROID_BYTES } from "@/lib/storage";
import { BAD_PHOTO, TOO_BIG } from "../lib/post-rules";

/** D477: every polaroid photo is re-encoded to this long edge. */
export const POLAROID_EDGE = 1600;

/**
 * The photo as a JPEG no longer than 1600 px, with its EXIF rotation applied (createImageBitmap
 * does that) and its final pixel size. Unlike `shrinkImage` it always re-encodes, so what is
 * uploaded is always small and upright. Throws the sentence the composer shows.
 */
export async function preparePhoto(file: File): Promise<{ file: File; width: number; height: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(BAD_PHOTO);
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, POLAROID_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(BAD_PHOTO);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error(BAD_PHOTO);
  if (blob.size > MAX_POLAROID_BYTES) throw new Error(TOO_BIG);
  return { file: new File([blob], "polaroid.jpg", { type: "image/jpeg" }), width, height };
}
