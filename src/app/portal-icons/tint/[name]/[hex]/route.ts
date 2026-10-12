import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { isTintableIcon, normaliseHex, tintFor } from "@/lib/tint";

/**
 * One of the portal's own launcher pictures in one colour (D488). Everything it needs is in
 * the URL, so there is no database read and the answer never changes for a given URL: cached
 * at the edge for good (a deploy clears it), and in the browser for a week in case the art
 * itself is redrawn. The source art is read from public/, which next.config traces into this
 * route's bundle.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string; hex: string }> }) {
  const { name, hex: raw } = await params;
  const hex = normaliseHex(raw);
  if (!isTintableIcon(name) || !hex || hex !== raw) return new Response("Not found", { status: 404 });

  const art = await readFile(path.join(process.cwd(), "public", "portal-icons", `${name}.webp`));
  const tint = tintFor(hex);
  const out = tint ? await sharp(art).modulate(tint).webp({ quality: 90 }).toBuffer() : art;
  return new Response(new Uint8Array(out), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=604800, s-maxage=31536000" },
  });
}
