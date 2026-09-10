import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { listEvents } from "@/lib/db/events";
import { pickLandingEvent } from "@/lib/landing";

export default async function AdminHome() {
  const { orgId } = await requireAdmin();
  const landing = pickLandingEvent(await listEvents(orgId));
  redirect(landing ? `/admin/events/${landing.id}` : "/admin/events");
}
