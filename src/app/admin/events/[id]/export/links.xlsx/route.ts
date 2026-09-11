import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees } from "@/lib/db/attendees";
import { appBaseUrl, attendeeLink } from "@/lib/links";
import { buildLinksWorkbook } from "@/lib/exports";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { orgId } = await requireAdmin(); const ev = await requireEvent(id, orgId);
  const base = appBaseUrl();
  const wb = buildLinksWorkbook((await listAttendees(ev.id)).map((a) => ({ name: a.name, email: a.email, company: a.company, category: a.category, table_no: a.table_no, link: attendeeLink(base, ev.slug, a.token) })));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${ev.slug}-links.xlsx"` } });
}
