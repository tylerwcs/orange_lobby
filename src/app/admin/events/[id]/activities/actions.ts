"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import {
  createActivity, updateActivity, deleteActivity, getActivity,
  createSession, updateSession, deleteSession, setSessionOrder, bookSession, listSessions,
  type BookResult,
} from "@/lib/db/activities";
import { readActivityPolicy, readNewActivity, describePlacement, type ActivityFormFields } from "@/lib/activities";
import { listAttendees } from "@/lib/db/attendees";
import { parseIds } from "@/lib/bulk";
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

function readSession(fd: FormData) {
  const title = text(fd, "title");
  if (!title) throw new Error("A session needs a title");
  const day = text(fd, "day");
  const starts_at = text(fd, "starts_at");
  if (!day || !starts_at) throw new Error("A session needs a day and a start time");
  const capacity = Number.parseInt(text(fd, "capacity") || "0", 10);
  if (!Number.isFinite(capacity) || capacity < 1) throw new Error("Capacity must be at least 1");
  return { title, day, starts_at, ends_at: text(fd, "ends_at") || null, location: text(fd, "location") || null, capacity };
}

export async function addSessionAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  await createSession(ev.id, activityId, readSession(fd));
  revalidatePath(`/admin/events/${eventId}/activities/${activityId}`);
}

export async function saveSessionAction(eventId: string, activityId: string, sessionId: string, fd: FormData) {
  const ev = await event(eventId);
  await updateSession(sessionId, ev.id, readSession(fd));
  revalidatePath(`/admin/events/${eventId}/activities/${activityId}`);
}

/**
 * Deleting a session takes its bookings with it (D135). The confirm dialog in `SessionList`
 * names how many, because "delete this session" and "cancel 28 people's afternoon" are the
 * same click; this action itself has nothing left to say beyond confirming it happened.
 */
export async function deleteSessionAction(eventId: string, activityId: string, sessionId: string) {
  const ev = await event(eventId);
  await deleteSession(sessionId, ev.id);
  const path = `/admin/events/${eventId}/activities/${activityId}`;
  revalidatePath(path);
  redirect(flashPath(path, "Session deleted."));
}

/**
 * Stores this activity's sessions in the order a drag or a keyboard move left them.
 *
 * `setSessionOrder` is scoped by event id, not activity id, so a posted id from a sibling
 * activity in the same event would otherwise let one activity's reorder silently renumber
 * another's sessions. The posted list is filtered down to this activity's own sessions first —
 * the same guard `reorderCheckpointsAction` applies per day — and a partial list (one that
 * doesn't cover every session this activity has) is dropped rather than applied, so a stale
 * tab can't renumber the rest by accident.
 */
export async function reorderSessionsAction(eventId: string, activityId: string, ids: string[]) {
  const ev = await event(eventId);
  const mine = new Set((await listSessions(ev.id)).filter((s) => s.activity_id === activityId).map((s) => s.id));
  const ordered = ids.filter((id) => mine.has(id));
  if (ordered.length !== mine.size) return;
  await setSessionOrder(ev.id, ordered);
  revalidatePath(`/admin/events/${eventId}/activities/${activityId}`);
}

/**
 * Places the selected people in one session.
 *
 * Goes through `bookSession` like everything else, with `ignoreOpen` true: the desk works
 * after booking has closed, but a full session refuses an organiser exactly as it refuses an
 * attendee (D126, D130). `describePlacement` turns the outcomes into the sentence the
 * organiser needs — "12 placed, 3 refused" — rather than a bare "Placed."
 */
export async function placeAttendeesAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  const path = `/admin/events/${eventId}/activities/${activityId}`;
  // The session comes from the form's own select, not from a bound argument: a form action
  // receives FormData and nothing else.
  const sessionId = String(fd.get("session_id") ?? "");
  // Never trust the posted list: it decides who gets written. `parseIds` filters it against
  // the attendees of THIS event, the same way the attendee bulk actions do. The field is a
  // comma-separated hidden input named "ids" (see BulkBar / UnbookedPanel).
  const attendees = await listAttendees(ev.id);
  const ids = parseIds(String(fd.get("ids") ?? ""), new Set(attendees.map((a) => a.id)));
  if (ids.length === 0) redirect(flashPath(path, "Nobody was selected.", "error"));

  const session = (await listSessions(ev.id)).find((s) => s.id === sessionId && s.activity_id === activityId);
  if (!session) redirect(flashPath(path, "That session no longer exists.", "error"));

  // Sequential, deliberately: `bookSession` takes `FOR UPDATE` on this session row and then
  // the activity row, so N concurrent calls would serialise inside Postgres anyway. Firing
  // them all at once buys no throughput and only means each one sits holding an HTTP
  // connection and a PostgREST pool slot while it waits its turn — a real stall risk for a
  // pool shared with the whole attendee portal when a desk places 200 people at once.
  // `setSessionOrder` (db/activities.ts) and the breakout bulk assign both write one at a time
  // for the same reason; this is the one place that used to differ. Do not "optimise" this
  // back into a `Promise.all` — the lock makes it free, and the pool makes it a liability.
  const outcomes: BookResult[] = [];
  for (const id of ids) {
    outcomes.push(await bookSession(session.id, id, true));
  }
  const { message, tone } = describePlacement(outcomes, session.title);
  revalidatePath(path);
  redirect(flashPath(path, message, tone));
}
