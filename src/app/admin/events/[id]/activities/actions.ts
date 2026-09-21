"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { createActivity, updateActivity, deleteActivity, getActivity } from "@/lib/db/activities";
import { readActivityPolicy, readNewActivity, type ActivityFormFields } from "@/lib/activities";
import { flashPath } from "@/lib/flash";

async function event(eventId: string) {
  const { orgId } = await requireAdmin();
  return requireEvent(eventId, orgId);
}

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const checked = (fd: FormData, key: string) => fd.get(key) !== null;

/** The fields the add form and the settings form share. `readActivityPolicy` in @/lib/activities validates them. */
function policyFields(fd: FormData): ActivityFormFields {
  return {
    name: text(fd, "name"),
    description: text(fd, "description"),
    required: checked(fd, "required"),
    max_per_attendee: text(fd, "max_per_attendee"),
    categories: text(fd, "categories"),
  };
}

export async function addActivityAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  await createActivity(ev, readNewActivity({ ...policyFields(fd), booking_open: checked(fd, "booking_open") }));
  revalidatePath(`/admin/events/${eventId}/activities`);
}

/**
 * Never touches `booking_open` (see `readActivityPolicy`'s note): the settings form this
 * saves has no `booking_open` field, so reading one from `fd` would read its absence as a
 * deliberate close and silently undo whatever `toggleBookingAction` last set.
 */
export async function saveActivityAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  await updateActivity(activityId, ev.id, readActivityPolicy(policyFields(fd)));
  revalidatePath(`/admin/events/${eventId}/activities`);
  revalidatePath(`/admin/events/${eventId}/activities/${activityId}`);
  redirect(flashPath(`/admin/events/${eventId}/activities/${activityId}`, "Activity saved."));
}

/**
 * The one control the desk uses during an event, so it is one click and its own action
 * rather than a field inside the settings form (D127).
 */
export async function toggleBookingAction(eventId: string, activityId: string) {
  const ev = await event(eventId);
  const activity = await getActivity(activityId, ev.id);
  if (!activity) redirect(flashPath(`/admin/events/${eventId}/activities`, "That activity no longer exists.", "error"));
  await updateActivity(activityId, ev.id, { booking_open: !activity.booking_open });
  const path = `/admin/events/${eventId}/activities/${activityId}`;
  revalidatePath(path);
  redirect(flashPath(path, activity.booking_open ? "Booking closed." : "Booking open."));
}

/** Cascades sessions and bookings (D135), so the confirm dialog says how many seats go with it. */
export async function deleteActivityAction(eventId: string, activityId: string) {
  const ev = await event(eventId);
  await deleteActivity(activityId, ev.id);
  revalidatePath(`/admin/events/${eventId}/activities`);
  redirect(flashPath(`/admin/events/${eventId}/activities`, "Activity deleted."));
}
