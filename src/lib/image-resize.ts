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

/**
 * D895: a picture's own width and height, turned the way it is shown (EXIF orientation 5-8 swap
 * them), or null for what sharp cannot read. An SVG reads at its declared size.
 */
export async function readImageDims(input: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const meta = await sharp(input).metadata();
    if (!meta.width || !meta.height) return null;
    const turned = (meta.orientation ?? 1) >= 5;
    return turned ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}
