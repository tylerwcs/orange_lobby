import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { eventFields } from "@/lib/attendee-fields";
import { exportColumns } from "@/lib/export-columns";
import { listAttendees } from "@/lib/db/attendees";
import { listActivities } from "@/lib/db/activities";
import { listBooths, listStampsForEvent } from "@/lib/db/booths";
import { buildPassportWorkbook } from "@/lib/exports";

// No `ids` param, same as rosters.xlsx: the passport answers a whole-room question — who has
// collected what — not a per-selection one, so there is no selection to honour here either.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { orgId } = await requireAdmin(); const ev = await requireEvent(id, orgId);
  const [attendees, passports, booths, stamps] = await Promise.all([
    listAttendees(ev.id), listActivities(ev.id, "passport"), listBooths(ev.id), listStampsForEvent(ev.id),
  ]);
  // A workbook with no sheets is corrupt (Excel refuses it); the Exports page only offers this link
  // when booths exist, so this is reachable only by URL — return 404 rather than broken file (D100/D181).
  if (passports.length === 0) return new Response("This event has no booth passport.", { status: 404 });
  const sheets = passports.map((p) => ({ name: p.name, booths: booths.filter((b) => b.activity_id === p.id), required: p.stamps_required }));
  const buf = await buildPassportWorkbook(attendees, sheets, stamps, exportColumns(eventFields(ev.registration_questions, ev.attendee_fields), ev.export_fields)).xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ev.slug}-passport.xlsx"`,
    },
  });
}
