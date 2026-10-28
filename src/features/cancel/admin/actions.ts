"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { getAttendee } from "@/lib/db/attendees";
import { hasAnyCheckin } from "@/lib/db/checkins";
import { flashPath } from "@/lib/flash";
import { afterPlacesChange } from "@/features/registration-queue";
import { blank, recordChange, type PersonChange } from "@/features/attendee-log";
import type { Attendee } from "@/lib/types";
import { approveCancelRequest, declineCancelRequest, restoreAttendee, withdrawCancelRequest } from "../db";

const requestsPath = (eventId: string) => `/admin/events/${eventId}/attendees?show=requests`;

/**
 * D743: the person a cancellation row is about, with their reason when they gave one. The
 * reason is read from `a` before the write: approve and decline both clear it from the row.
 */
function whoCancelled(a: Pick<Attendee, "id" | "name" | "email" | "cancel_reason">): PersonChange {
  const reason = blank(a.cancel_reason);
  return { attendeeId: a.id, name: a.name, email: a.email, ...(reason ? { snapshot: [{ label: "Reason", value: reason }] } : {}) };
}

/** D598: approve - the D580-D582 cancel. Admins and committee alike. */
export async function approveCancelRequestAction(eventId: string, attendeeId: string) {
  const { ev, actor } = await requireEventAccess(eventId);
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
  if (ok) await recordChange(ev.id, actor, { kind: "cancel_approve", summary: `Approved ${a.name}'s cancellation`, people: [whoCancelled(a)] });
  // D682: a form registrant's cancellation frees a counted place; the waiting list moves along.
  const moved = ok && a.source === "registration" ? await afterPlacesChange(ev.id, actor, "a cancellation") : "";
  revalidatePath(`/admin/events/${ev.id}`, "layout");
  redirect(flashPath(requestsPath(ev.id), ok ? [`Cancelled ${a.name}.`, moved].filter(Boolean).join(" ") : `${a.name} no longer has a waiting request.`, ok ? "ok" : "error"));
}

/** D596/D598: decline - the attendee stays registered and is told on their next visit. Admins and committee alike. */
export async function declineCancelRequestAction(eventId: string, attendeeId: string) {
  const { ev, actor } = await requireEventAccess(eventId);
  if (ev.status === "archived") redirect(flashPath(requestsPath(ev.id), "This event is archived.", "error"));
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== ev.id) redirect(flashPath(requestsPath(ev.id), "That attendee is no longer on this event.", "error"));
  const ok = await declineCancelRequest(ev.id, a.id);
  if (ok) await recordChange(ev.id, actor, { kind: "cancel_decline", summary: `Declined ${a.name}'s cancellation`, people: [whoCancelled(a)] });
  revalidatePath(`/admin/events/${ev.id}`, "layout");
  redirect(flashPath(requestsPath(ev.id), ok ? `Declined ${a.name}'s request.` : `${a.name} no longer has a waiting request.`, ok ? "ok" : "error"));
}

/** D588: Restore — admins and committee alike (event data). Bookings are not restored. */
export async function restoreAttendeeAction(eventId: string, attendeeId: string) {
  const { ev, actor } = await requireEventAccess(eventId);
  const a = await getAttendee(attendeeId);
  const path = `/admin/events/${ev.id}/attendees`;
  if (!a || a.event_id !== ev.id) redirect(flashPath(path, "That attendee is no longer on this event.", "error"));
  // D743: only a person who really was cancelled is logged; a stale click on a restored row changes nothing.
  if (await restoreAttendee(ev.id, a.id)) {
    await recordChange(ev.id, actor, { kind: "restore", summary: `Restored ${a.name}`, people: [{ attendeeId: a.id, name: a.name, email: a.email }] });
  }
  revalidatePath(path);
  redirect(flashPath(path, `Restored ${a.name}.`));
}
