"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess, type Actor } from "@/lib/access";
import { flashPath } from "@/lib/flash";
import { listAttendeesByIds } from "@/lib/db/attendees";
import { attendeeValues, loadLabels, recordChange } from "@/features/attendee-log";
import { approveEntry, declineEntry, getEntry, moveInEntry, removeEntry, type Moved } from "../db";
import { notifyRegistered } from "../notify";
import { whatsappNote } from "../lib/rules";
import { logMoveIns, movedLine } from "./places";
import type { Event, RegistrationEntry } from "@/lib/types";

const viewPath = (eventId: string, view: "waitlist" | "pending") => `/admin/events/${eventId}/attendees?show=${view}`;

/**
 * The organiser's event and the entry, checked to belong to it. An archived event is read-only
 * (as approve-cancel): the rows show, nothing moves. Admins and committee alike (D685, D698).
 */
async function requireEntry(eventId: string, entryId: string, view: "waitlist" | "pending") {
  const { ev, actor } = await requireEventAccess(eventId);
  const back = viewPath(ev.id, view);
  if (ev.status === "archived") redirect(flashPath(back, "This event is archived.", "error"));
  const entry = await getEntry(entryId);
  if (!entry || entry.event_id !== ev.id) redirect(flashPath(back, "That person is no longer on this list.", "error"));
  return { ev, actor, entry: entry as RegistrationEntry, back };
}

/**
 * D743: one attendee-log row for each person a staff Move in or Approve registered, named in
 * its own summary (it is that row's only person). Called after the WhatsApp send, so a log
 * failure can show an error but never keeps a message from going out.
 */
async function logRegistered(ev: Event, by: Actor, moved: Moved[], kind: "queue_move_in" | "queue_approve", verb: string): Promise<void> {
  const ids = moved.flatMap((m) => (m.attendeeId ? [m.attendeeId] : []));
  if (ids.length === 0) return;
  const [rows, labels] = await Promise.all([listAttendeesByIds(ev.id, ids), loadLabels(ev)]);
  for (const a of rows) {
    await recordChange(ev.id, by, { kind, summary: `${verb} ${a.name}`, people: [{ attendeeId: a.id, name: a.name, email: a.email, snapshot: attendeeValues(a, labels) }] });
  }
}

const done = (eventId: string, back: string, line: string, ok = true): never => {
  revalidatePath(`/admin/events/${eventId}`, "layout");
  redirect(flashPath(back, line, ok ? "ok" : "error"));
};

/** D685, D694, D701: Move in by hand, past the limit and while closed. With approval on it goes to pending, unmessaged. */
export async function moveInAction(eventId: string, entryId: string) {
  const { ev, actor, entry, back } = await requireEntry(eventId, entryId, "waitlist");
  const moved = await moveInEntry(entry.id);
  if (moved.length === 0) done(ev.id, back, `${entry.name} is no longer on the waiting list.`, false);
  const sent = await notifyRegistered(ev, moved, "moved_in");
  await logRegistered(ev, actor, moved, "queue_move_in", "Moved in");
  done(ev.id, back, await movedLine(moved, sent));
}

/** D685: Remove from the waiting list. No message, and nothing else moves: a waiting person held no place. */
export async function removeEntryAction(eventId: string, entryId: string) {
  const { ev, entry, back } = await requireEntry(eventId, entryId, "waitlist");
  const ok = await removeEntry(entry.id);
  done(ev.id, back, ok ? `Removed ${entry.name} from the waiting list.` : `${entry.name} is no longer on the waiting list.`, ok);
}

/** D699: Approve, whether or not registration is still open. They become registered and get the approval message. */
export async function approveEntryAction(eventId: string, entryId: string) {
  const { ev, actor, entry, back } = await requireEntry(eventId, entryId, "pending");
  if (entry.state !== "pending") done(ev.id, back, `${entry.name} is no longer waiting for approval.`, false);
  const moved = await approveEntry(entry.id);
  const sent = await notifyRegistered(ev, moved, "approved");
  await logRegistered(ev, actor, moved, "queue_approve", "Approved");
  done(ev.id, back, [`Approved ${entry.name}.`, whatsappNote(sent)].filter(Boolean).join(" "));
}

/** D700: Decline. No message; the freed place goes to the next person waiting (pending with approval on, D701). */
export async function declineEntryAction(eventId: string, entryId: string) {
  const { ev, actor, entry, back } = await requireEntry(eventId, entryId, "pending");
  if (entry.state !== "pending") done(ev.id, back, `${entry.name} is no longer waiting for approval.`, false);
  const moved = await declineEntry(entry.id);
  // D703: approval may have been switched off since, in which case the fill registered someone.
  const sent = await notifyRegistered(ev, moved, "moved_in");
  // D743: the decline itself is not an attendee change; only whoever its freed place registered is logged.
  const logged = await logMoveIns(ev.id, actor, moved, "declining a pending registration");
  done(ev.id, back, [`Declined ${entry.name}.`, await movedLine(moved, sent), logged].filter(Boolean).join(" "));
}
