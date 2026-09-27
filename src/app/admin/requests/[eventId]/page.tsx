import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";

/**
 * Where the committee reminder's button lands. A WhatsApp template's link is a fixed prefix plus
 * one variable, so the event id is the whole variable and this forwards to the page that lists
 * each activity with its waiting requests. The proxy sends a signed-out tap to /login first.
 */
export default async function RequestsRedirect({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  redirect(`/admin/events/${ev.id}/activities`);
}
