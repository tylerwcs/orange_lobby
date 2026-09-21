"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { createActivity, updateActivity, deleteActivity, getActivity } from "@/lib/db/activities";
import { parseCategories } from "@/lib/agenda";
import { flashPath } from "@/lib/flash";

async function event(eventId: string) {
  const { orgId } = await requireAdmin();
  return requireEvent(eventId, orgId);
}

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const checked = (fd: FormData, key: string) => fd.get(key) !== null;

/** Shared by add and save so the two can never disagree about what a valid activity is. */
function readActivity(fd: FormData) {
  const name = text(fd, "name");
  if (!name) throw new Error("An activity needs a name");
  const raw = text(fd, "max_per_attendee") || "1";
  const max = Number.parseInt(raw, 10);
  if (!Number.isFinite(max) || max < 1 || max > 10) {
    throw new Error("Sessions per person must be a whole number between 1 and 10");
  }
  return {
    name,
    description: text(fd, "description") || null,
    required: checked(fd, "required"),
    booking_open: checked(fd, "booking_open"),
    max_per_attendee: max,
    categories: parseCategories(text(fd, "categories")),
  };
}

export async function addActivityAction(eventId: string, fd: FormData) {
  const ev = await event(eventId);
  await createActivity(ev, readActivity(fd));
  revalidatePath(`/admin/events/${eventId}/activities`);
}

export async function saveActivityAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  await updateActivity(activityId, ev.id, readActivity(fd));
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
