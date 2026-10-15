"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { getAttendee } from "@/lib/db/attendees";
import { flashPath } from "@/lib/flash";
import { restoreAttendee } from "../db";

/** D588: Restore — admins and committee alike (event data). Bookings are not restored. */
export async function restoreAttendeeAction(eventId: string, attendeeId: string) {
  const { ev } = await requireEventAccess(eventId);
  const a = await getAttendee(attendeeId);
  const path = `/admin/events/${ev.id}/attendees`;
  if (!a || a.event_id !== ev.id) redirect(path);
  await restoreAttendee(ev.id, a.id);
  revalidatePath(path);
  redirect(flashPath(path, `Restored ${a.name}.`));
}
