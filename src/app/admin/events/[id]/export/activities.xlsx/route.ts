import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listAttendees } from "@/lib/db/attendees";
import { listActivities, listSessions, listBookings } from "@/lib/db/activities";
import { eligible, unbookedIds } from "@/lib/activities";
import { buildActivityRostersWorkbook, type ActivitySessionRoster, type ActivityUnbookedRoster, type RosterPerson } from "@/lib/exports";

// Same shape as rosters.xlsx: the whole door list, not a selection, so there is no `ids` param
// and no way for it to fail open.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { orgId } = await requireAdmin(); const ev = await requireEvent(id, orgId);
  const [attendees, activities, sessions, bookings] = await Promise.all([
    listAttendees(ev.id), listActivities(ev.id), listSessions(ev.id), listBookings(ev.id),
  ]);
  const attendeeIds = attendees.map((a) => a.id);
  // listAttendees is already ordered by name; ranking bookings into that order is what makes
  // each session's list both deterministic (listBookings has no ORDER BY) and alphabetical,
  // the same trick `rosters` in lib/breakouts.ts plays for breakout rooms.
  const rank = new Map(attendeeIds.map((aid, i) => [aid, i]));
  const bySession = new Map<string, string[]>();
  for (const b of bookings) {
    const list = bySession.get(b.session_id);
    if (list) list.push(b.attendee_id); else bySession.set(b.session_id, [b.attendee_id]);
  }
  for (const list of bySession.values()) list.sort((x, y) => (rank.get(x) ?? Infinity) - (rank.get(y) ?? Infinity));

  const attendeeById = new Map(attendees.map((a) => [a.id, a]));
  const sessionRosters: ActivitySessionRoster[] = activities.flatMap((activity) =>
    sessions.filter((s) => s.activity_id === activity.id).map((s) => ({
      activityName: activity.name, sessionTitle: s.title, attendeeIds: bySession.get(s.id) ?? [],
    })),
  );
  // Only required activities get an unbooked sheet: an optional activity nobody joined is not
  // the desk's problem the way a required one — which every eligible attendee is meant to hold
  // exactly one seat in (D129) — is.
  const unbooked: ActivityUnbookedRoster[] = activities.filter((a) => a.required).map((activity) => {
    const bookedIds = new Set(bookings.filter((b) => b.activity_id === activity.id).map((b) => b.attendee_id));
    return {
      activityName: activity.name,
      attendeeIds: unbookedIds(attendeeIds, (aid) => eligible(activity, attendeeById.get(aid)?.category ?? null), bookedIds),
    };
  });

  const people = new Map<string, RosterPerson>(attendees.map((a) => [a.id, { name: a.name, email: a.email }]));
  const buf = await buildActivityRostersWorkbook(sessionRosters, unbooked, people).xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ev.slug}-activity-rosters.xlsx"`,
    },
  });
}
