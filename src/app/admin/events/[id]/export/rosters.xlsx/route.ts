import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees } from "@/lib/db/attendees";
import { listAgenda } from "@/lib/db/agenda";
import { listAssignments } from "@/lib/db/breakouts";
import { breakoutSlots, rosters } from "@/lib/breakouts";
import { buildRosterWorkbook, type RosterPerson } from "@/lib/exports";

// Unlike attendance.xlsx, this route takes no `ids` param: a roster is the whole room or it is
// not a roster, so there is no selection to honour and no way for it to fail open.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { orgId } = await requireAdmin(); const ev = await requireEvent(id, orgId);
  const [attendees, items] = await Promise.all([listAttendees(ev.id), listAgenda(ev.id)]);
  // Only queried when the event actually runs breakout rounds — same guard as the agenda admin
  // page and the exports list, so a non-breakout event issues no new queries and gets an empty
  // roster list rather than a query against a table it may not even have (pre-migration 0007).
  const assignments = breakoutSlots(items).length > 0 ? await listAssignments(ev.id) : [];
  const people = new Map<string, RosterPerson>(
    attendees.map((a) => [a.id, { name: a.name, company: a.company, email: a.email }]),
  );
  const slots = rosters(items, attendees.map((a) => a.id), assignments);
  const buf = await buildRosterWorkbook(slots, people).xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ev.slug}-breakout-rosters.xlsx"`,
    },
  });
}
