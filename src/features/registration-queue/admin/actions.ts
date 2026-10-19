"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEventAccess } from "@/lib/access";
import { flashPath } from "@/lib/flash";
import { approveEntry, declineEntry, getEntry, moveInEntry, removeEntry } from "../db";
import { notifyRegistered } from "../notify";
import { whatsappNote } from "../lib/rules";
import { movedLine } from "./places";
import type { RegistrationEntry } from "@/lib/types";

const viewPath = (eventId: string, view: "waitlist" | "pending") => `/admin/events/${eventId}/attendees?show=${view}`;

/**
 * The organiser's event and the entry, checked to belong to it. An archived event is read-only
 * (as approve-cancel): the rows show, nothing moves. Admins and committee alike (D685, D698).
 */
async function requireEntry(eventId: string, entryId: string, view: "waitlist" | "pending") {
  const { ev } = await requireEventAccess(eventId);
  const back = viewPath(ev.id, view);
  if (ev.status === "archived") redirect(flashPath(back, "This event is archived.", "error"));
  const entry = await getEntry(entryId);
  if (!entry || entry.event_id !== ev.id) redirect(flashPath(back, "That person is no longer on this list.", "error"));
  return { ev, entry: entry as RegistrationEntry, back };
}

const done = (eventId: string, back: string, line: string, ok = true): never => {
  revalidatePath(`/admin/events/${eventId}`, "layout");
  redirect(flashPath(back, line, ok ? "ok" : "error"));
};

/** D685, D694, D701: Move in by hand, past the limit and while closed. With approval on it goes to pending, unmessaged. */
export async function moveInAction(eventId: string, entryId: string) {
  const { ev, entry, back } = await requireEntry(eventId, entryId, "waitlist");
  const moved = await moveInEntry(entry.id);
  if (moved.length === 0) done(ev.id, back, `${entry.name} is no longer on the waiting list.`, false);
  const sent = await notifyRegistered(ev, moved, "moved_in");
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
  const { ev, entry, back } = await requireEntry(eventId, entryId, "pending");
  if (entry.state !== "pending") done(ev.id, back, `${entry.name} is no longer waiting for approval.`, false);
  const moved = await approveEntry(entry.id);
  const sent = await notifyRegistered(ev, moved, "approved");
  done(ev.id, back, [`Approved ${entry.name}.`, whatsappNote(sent)].filter(Boolean).join(" "));
}

/** D700: Decline. No message; the freed place goes to the next person waiting (pending with approval on, D701). */
export async function declineEntryAction(eventId: string, entryId: string) {
  const { ev, entry, back } = await requireEntry(eventId, entryId, "pending");
  if (entry.state !== "pending") done(ev.id, back, `${entry.name} is no longer waiting for approval.`, false);
  const moved = await declineEntry(entry.id);
  // D703: approval may have been switched off since, in which case the fill registered someone.
  const sent = await notifyRegistered(ev, moved, "moved_in");
  done(ev.id, back, [`Declined ${entry.name}.`, await movedLine(moved, sent)].filter(Boolean).join(" "));
}
