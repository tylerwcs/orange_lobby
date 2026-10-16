import { notFound } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { eventFields } from "@/lib/attendee-fields";
import { exportColumns } from "@/lib/export-columns";
import { listAttendees } from "@/lib/db/attendees";
import { listGroups } from "@/lib/db/groups";
import { slugify } from "@/lib/slug";
import { buildSquadsWorkbook, getTournamentActivity, isLocked, listSports, squadExportRows, squadRows } from "@/features/tournaments";

// D649: one tournament's squads, every sport and group, on one sheet. The tournament is named by
// `?activity=`, and must be this event's: anything else is a 404, never another event's squads.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ev } = await requireEventAccess(id);
  const activityId = new URL(req.url).searchParams.get("activity") ?? "";
  const cup = activityId ? await getTournamentActivity(activityId, ev.id) : null;
  if (!cup) notFound();

  // Cancelled people are read too, so `squadExportRows` can see them and leave them out (D643).
  const [sports, groups, rows, attendees] = await Promise.all([
    listSports(cup.id), listGroups(ev.id), squadRows(cup.id), listAttendees(ev.id, undefined, "wide", { includeCancelled: true }),
  ]);
  const people = new Map(attendees.map((a) => [a.id, a]));
  const squadPeople = new Map(attendees.map((a) => [a.id, { id: a.id, name: a.name, group_id: a.group_id, cancelled_at: a.cancelled_at ?? null }]));
  const lines = squadExportRows({ sports, groups, rows, people: squadPeople, locked: isLocked(cup.squads_close_at, new Date()) });
  const columns = exportColumns(eventFields(ev.registration_questions, ev.attendee_fields), ev.export_fields);
  const buf = await buildSquadsWorkbook(lines, people, columns).xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ev.slug}-${slugify(cup.name) || "tournament"}-squads.xlsx"`,
    },
  });
}
