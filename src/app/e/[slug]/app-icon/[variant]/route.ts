import sharp from "sharp";
import { getEventBySlug } from "@/lib/db/events";
import { serviceClient } from "@/lib/supabase/service";
import { MEDIA_BUCKET } from "@/lib/storage";
import { ICON_VARIANTS, iconVersion, isIconVariant, logoPath } from "@/lib/event-icon";

/**
 * One variant of an event's app icon (D487), drawn from its logo on request. The logo comes
 * out of our own bucket by path, never fetched by URL. Anything that goes wrong - no logo, a
 * file sharp cannot read - sends the browser to ECP Hub's icon for the same slot, so a home
 * screen never gets a broken image.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; variant: string }> }) {
  const { slug, variant } = await params;
  if (!isIconVariant(variant)) return new Response("Not found", { status: 404 });
  const spec = ICON_VARIANTS[variant];
  const fallback = () => Response.redirect(new URL(spec.fallback, req.url), 307);

  const event = await getEventBySlug(slug);
  const path = event ? logoPath(event) : null;
  if (!event || !path) return fallback();

  const { data } = await serviceClient().storage.from(MEDIA_BUCKET).download(path);
  if (!data) return fallback();

  let png: Buffer;
  try {
    png = await drawIcon(Buffer.from(await data.arrayBuffer()), spec.size, spec.pad);
  } catch {
    return fallback();
  }
  // The URL carries the logo's version, so the current one is cached for good; an old or
  // missing version still gets today's logo, but only for a few minutes.
  const current = new URL(req.url).searchParams.get("v") === iconVersion(event.logo_url!);
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": current ? "public, max-age=31536000, immutable" : "public, max-age=300",
    },
  });
}

/** The logo, trimmed of its own empty margin, fitted whole inside a white square. */
async function drawIcon(logo: Buffer, size: number, pad: number): Promise<Buffer> {
  const inner = Math.round(size * (1 - 2 * pad));
  // density: an SVG logo is rasterised sharp rather than scaled up from 72 dpi.
  let source = sharp(logo, { density: 300 });
  try {
    source = sharp(await source.clone().trim({ threshold: 10 }).toBuffer());
  } catch {
    // A logo that is one flat colour has nothing to trim; draw it as it is.
  }
  const fitted = await source
    .resize(inner, inner, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: "#ffffff" } })
    .composite([{ input: fitted, gravity: "center" }])
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
}
