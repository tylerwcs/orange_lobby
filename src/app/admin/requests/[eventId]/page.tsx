import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";

/**
 * Where the committee reminder's button lands. A WhatsApp template's link is a fixed prefix plus
 * one variable, so the event id is the whole variable and this forwards to the page that lists
 * each activity with its waiting requests. The proxy sends a signed-out tap to /login first.
 */
export default async function RequestsRedirect({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { ev } = await requireEventAccess(eventId);
  redirect(`/admin/events/${ev.id}/activities`);
}
