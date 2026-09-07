import JSZip from "jszip";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees } from "@/lib/db/attendees";
import { appBaseUrl, attendeeLink } from "@/lib/links";
import { qrPngBuffer } from "@/lib/qr";
import { safeFileName } from "@/lib/exports";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { orgId } = await requireAdmin(); const ev = await requireEvent(id, orgId);
  const attendees = await listAttendees(ev.id);
  const zip = new JSZip();
  const base = appBaseUrl();
  for (const a of attendees) zip.file(safeFileName(a.name, a.id), await qrPngBuffer(attendeeLink(base, ev.slug, a.token)));
  const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return new Response(Buffer.from(body), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${ev.slug}-qr.zip"` } });
}
