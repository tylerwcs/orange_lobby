import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/access";
import { listEvents, listEventsByIds } from "@/lib/db/events";
import { pickLandingEvent } from "@/lib/landing";

export default async function AdminHome() {
  const me = await requireSignedIn();
  const events = me.kind === "admin" ? await listEvents(me.orgId) : await listEventsByIds(me.eventIds);
  // D552: the single-event shortcut is for committee members only - their one event goes
  // straight in. An admin keeps the landing rule as before, even with a single event.
  const landing = me.kind === "admin"
    ? pickLandingEvent(events)
    : events.length === 1 ? events[0] : pickLandingEvent(events);
  redirect(landing ? `/admin/events/${landing.id}` : "/admin/events");
}
