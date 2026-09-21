import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees } from "@/lib/db/attendees";
import { listActivities, listSessions, listBookings } from "@/lib/db/activities";
import { sessionRosters, unbookedByActivity } from "@/lib/activities";
import { buildActivityRostersWorkbook, type ActivitySessionRoster, type ActivityUnbookedRoster, type RosterPerson } from "@/lib/exports";

// Same shape as rosters.xlsx: the whole door list, not a selection, so there is no `ids` param
// and no way for it to fail open.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { orgId } = await requireAdmin(); const ev = await requireEvent(id, orgId);
  const [attendees, activities, sessions, bookings] = await Promise.all([
    listAttendees(ev.id), listActivities(ev.id), listSessions(ev.id), listBookings(ev.id),
  ]);
  const attendeeIds = attendees.map((a) => a.id);
  const attendeeById = new Map(attendees.map((a) => [a.id, a]));

  // Grouping and eligibility both live in @/lib/activities (sessionRosters, unbookedByActivity)
  // rather than inline here, so they carry their own unit tests the way `rosters()` in
  // lib/breakouts.ts does for the sibling breakout export — this route only reshapes their
  // output into the names buildActivityRostersWorkbook wants.
  const bySession = sessionRosters(sessions.map((s) => s.id), bookings, attendeeIds);
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const unbookedByActivityId = unbookedByActivity(activities, bookings, attendeeIds, (aid) => attendeeById.get(aid)?.category ?? null);

  const sessionRows: ActivitySessionRoster[] = activities.flatMap((activity) =>
    sessions.filter((s) => s.activity_id === activity.id).map((s) => ({
      activityName: activity.name, sessionTitle: s.title, attendeeIds: bySession.get(s.id) ?? [],
    })),
  );
  const unbookedRows: ActivityUnbookedRoster[] = unbookedByActivityId.map((u) => ({
    activityName: activityById.get(u.activityId)!.name,
    attendeeIds: u.attendeeIds,
  }));

  const people = new Map<string, RosterPerson>(attendees.map((a) => [a.id, { name: a.name, email: a.email }]));
  const buf = await buildActivityRostersWorkbook(sessionRows, unbookedRows, people).xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ev.slug}-activity-rosters.xlsx"`,
    },
  });
}
