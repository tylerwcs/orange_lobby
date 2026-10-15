import { requireEventAccess } from "@/lib/access";
import { listAttendees, listCancelledAttendees } from "@/lib/db/attendees";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { buildAttendanceWorkbook } from "@/lib/exports";
import { scannerNames } from "@/lib/db/users";
import { eventFields } from "@/lib/attendee-fields";
import { parseIds } from "@/lib/bulk";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { ev } = await requireEventAccess(id);
  // D588: cancelled people follow the active ones, each carrying a Cancelled at date.
  const [active, cancelled, cps, cis] = await Promise.all([listAttendees(ev.id), listCancelledAttendees(ev.id), listCheckpoints(ev.id), listCheckinsForEvent(ev.id)]);
  const attendees = [...active, ...cancelled];
  // The posted list decides which rows are exported, so it is validated against this event's
  // own attendees exactly as the bulk server actions do — an id from another event never widens the export.
  const idsParam = new URL(req.url).searchParams.get("ids");
  const selectedIds = parseIds(idsParam, new Set(attendees.map((a) => a.id)));
  // No `ids` param at all means "export everything" (unchanged full-roster behaviour). An
  // `ids` param that matched nothing must export nothing, not silently fail open to everyone.
  const rows = idsParam === null ? attendees : attendees.filter((a) => selectedIds.includes(a.id));
  const names = await scannerNames(cis.map((c) => c.scanned_by));
  const buf = await buildAttendanceWorkbook(rows, cps, cis, names, eventFields(ev.registration_questions, ev.attendee_fields)).xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${ev.slug}-attendance.xlsx"` } });
}
