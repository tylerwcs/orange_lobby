import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { eventAddress } from "@/features/domains";
import { isShareLinkKind, shareLink, shareQrFileName } from "@/lib/links";
import { qrPngBuffer } from "@/lib/qr";

/** Print size: big enough for a poster or a standee without going soft (D491). */
const PRINT_PX = 1200;

/**
 * A share link's QR as a PNG to print (D491). Made from the event's address at the moment
 * of the download, so it follows a domain change rather than a saved image.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; link: string }> }) {
  const { id, link } = await params;
  const { orgId } = await requireAdmin(); const ev = await requireEvent(id, orgId);
  if (!isShareLinkKind(link)) notFound();
  const png = await qrPngBuffer(shareLink(link, await eventAddress(ev)), PRINT_PX);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="${shareQrFileName(ev.slug, link)}"` } });
}
