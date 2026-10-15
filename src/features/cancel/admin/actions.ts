"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { getAttendee } from "@/lib/db/attendees";
import { hasAnyCheckin } from "@/lib/db/checkins";
import { flashPath } from "@/lib/flash";
import { approveCancelRequest, declineCancelRequest, restoreAttendee, withdrawCancelRequest } from "../db";

const requestsPath = (eventId: string) => `/admin/events/${eventId}/attendees?show=requests`;

/** D598: approve - the D580-D582 cancel. Admins and committee alike. */
export async function approveCancelRequestAction(eventId: string, attendeeId: string) {
  const { ev } = await requireEventAccess(eventId);
  // An archived event is read-only: nothing is cancelled or declined on it.
  if (ev.status === "archived") redirect(flashPath(requestsPath(ev.id), "This event is archived.", "error"));
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== ev.id) redirect(flashPath(requestsPath(ev.id), "That attendee is no longer on this event.", "error"));
  // D597: they came, so the request no longer stands. Withdraw it rather than cancel someone who is here.
  if (await hasAnyCheckin(a.id)) {
    await withdrawCancelRequest(ev.id, a.id);
    revalidatePath(`/admin/events/${ev.id}`, "layout");
    redirect(flashPath(requestsPath(ev.id), `${a.name} has checked in, so the request was withdrawn.`, "error"));
  }
  const ok = await approveCancelRequest(ev.id, a.id);
  revalidatePath(`/admin/events/${ev.id}`, "layout");
  redirect(flashPath(requestsPath(ev.id), ok ? `Cancelled ${a.name}.` : `${a.name} no longer has a waiting request.`, ok ? "ok" : "error"));
}

/** D596/D598: decline - the attendee stays registered and is told on their next visit. Admins and committee alike. */
export async function declineCancelRequestAction(eventId: string, attendeeId: string) {
  const { ev } = await requireEventAccess(eventId);
  if (ev.status === "archived") redirect(flashPath(requestsPath(ev.id), "This event is archived.", "error"));
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== ev.id) redirect(flashPath(requestsPath(ev.id), "That attendee is no longer on this event.", "error"));
  const ok = await declineCancelRequest(ev.id, a.id);
  revalidatePath(`/admin/events/${ev.id}`, "layout");
  redirect(flashPath(requestsPath(ev.id), ok ? `Declined ${a.name}'s request.` : `${a.name} no longer has a waiting request.`, ok ? "ok" : "error"));
}

/** D588: Restore — admins and committee alike (event data). Bookings are not restored. */
export async function restoreAttendeeAction(eventId: string, attendeeId: string) {
  const { ev } = await requireEventAccess(eventId);
  const a = await getAttendee(attendeeId);
  const path = `/admin/events/${ev.id}/attendees`;
  if (!a || a.event_id !== ev.id) redirect(flashPath(path, "That attendee is no longer on this event.", "error"));
  await restoreAttendee(ev.id, a.id);
  revalidatePath(path);
  redirect(flashPath(path, `Restored ${a.name}.`));
}
