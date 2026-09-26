import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { eventFields } from "@/lib/attendee-fields";
import { exportColumns } from "@/lib/export-columns";
import { listAttendees } from "@/lib/db/attendees";
import { appBaseUrl, attendeeLink } from "@/lib/links";
import { buildLinksWorkbook } from "@/lib/exports";
import { fieldValue } from "@/lib/attendee-values";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { orgId } = await requireAdmin(); const ev = await requireEvent(id, orgId);
  const base = appBaseUrl();
  const wb = buildLinksWorkbook((await listAttendees(ev.id)).map((a) => ({ name: a.name, email: a.email, category: a.category, table_no: fieldValue(a, "table_no"), link: attendeeLink(base, ev.slug, a.token), extra: a.extra })),
    // Table is already a fixed column on this sheet, so it is never added a second time.
    exportColumns(eventFields(ev.registration_questions, ev.attendee_fields), ev.export_fields, ["table_no"]));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${ev.slug}-links.xlsx"` } });
}
