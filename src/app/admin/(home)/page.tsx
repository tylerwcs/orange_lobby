import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/access";
import { listEvents, listEventsByIds } from "@/lib/db/events";
import { pickLandingEvent } from "@/lib/landing";

export default async function AdminHome() {
  const me = await requireSignedIn();
  const events = me.kind === "admin" ? await listEvents(me.orgId) : await listEventsByIds(me.eventIds);
  // D552: one event goes straight in; several use the same landing rule as an admin.
  const landing = events.length === 1 ? events[0] : pickLandingEvent(events);
  redirect(landing ? `/admin/events/${landing.id}` : "/admin/events");
}
