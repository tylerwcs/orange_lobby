import sharp from "sharp";

/**
 * D889: an uploaded picture made small enough for 685 phones on venue Wi-Fi - at most `maxEdge`
 * on its long side, as WebP. Never enlarged; turned the way the camera meant (EXIF). An SVG is
 * returned as it is: it is already small and has no pixels to shrink. Server only (sharp).
 */
export async function resizeForWeb(file: File, maxEdge: number): Promise<{ body: Buffer | File; type: string; ext: string }> {
  if (file.type.toLowerCase() === "image/svg+xml") return { body: file, type: "image/svg+xml", ext: "svg" };
  const input = Buffer.from(await file.arrayBuffer());
  const body = await sharp(input)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  return { body, type: "image/webp", ext: "webp" };
}
