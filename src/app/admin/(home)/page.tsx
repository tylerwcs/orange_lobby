import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/access";
import { listEvents, listEventsByIds } from "@/lib/db/events";
import { pickLandingEvent } from "@/lib/landing";

export default async function AdminHome() {
  const me = await requireSignedIn();
  const landing = pickLandingEvent(me.kind === "admin" ? await listEvents(me.orgId) : await listEventsByIds(me.eventIds));
  redirect(landing ? `/admin/events/${landing.id}` : "/admin/events");
}
