import "server-only";
import { getEvent } from "@/lib/db/events";
import { listAttendeesByIds } from "@/lib/db/attendees";
import type { Actor } from "@/lib/access";
import { attendeeValues, loadLabels, people, recordChange } from "@/features/attendee-log";
import { entryNames, fillFreePlaces, type Moved } from "../db";
import { notifyRegistered } from "../notify";
import { movedFlash, whatsappNote, type NotifyResult } from "../lib/rules";

/**
 * The flash line for rows a fill, Move in or Decline moved: who went where (one person by name,
 * several by count), then what WhatsApp did for the ones now registered. Only a group of one
 * needs its name, so at most two are read.
 */
export async function movedLine(moved: Moved[], sent: NotifyResult): Promise<string> {
  if (moved.length === 0) return "";
  const single = (["registered", "pending"] as const).flatMap((s) => {
    const rows = moved.filter((m) => m.newState === s);
    return rows.length === 1 ? [rows[0].entryId] : [];
  });
  const names = await entryNames(single);
  return [movedFlash(moved.map((m) => ({ name: names.get(m.entryId) ?? "", newState: m.newState }))), whatsappNote(sent)]
    .filter(Boolean).join(" ");
}

/**
 * D743: the attendee log's row for people a fill registered, next to the action that freed
 * the place. One row for the whole fill, and no names in its summary: `cause` is name-free too
 * (erasure strips the people list, not the summary). Returns "" when logged or when nobody
 * was registered, else a line for the flash: the move-in itself has already happened, so a
 * failed log write is reported and never thrown.
 */
export async function logMoveIns(eventId: string, by: Actor, moved: Moved[], cause: string): Promise<string> {
  const ids = moved.flatMap((m) => (m.newState === "registered" && m.attendeeId ? [m.attendeeId] : []));
  if (ids.length === 0) return "";
  try {
    const ev = await getEvent(eventId);
    if (!ev) return "";
    const [rows, labels] = await Promise.all([listAttendeesByIds(eventId, ids), loadLabels(ev)]);
    if (rows.length === 0) return "";
    await recordChange(eventId, by, {
      kind: "move_in_auto",
      summary: `Moved in ${people(rows.length)} from the waiting list after ${cause}`,
      people: rows.map((a) => ({ attendeeId: a.id, name: a.name, email: a.email, snapshot: attendeeValues(a, labels) })),
    });
    return "";
  } catch (e) {
    console.error("logMoveIns failed", e);
    return "The waiting-list move-in could not be logged.";
  }
}

/**
 * D682, D691: call after anything that may have freed a counted place, raised or cleared the
 * limit, or reopened registration. Moves the waiting list along (`fill_free_places`, which does
 * nothing while registration is closed, D683), WhatsApps whoever became registered (D684), and
 * returns a line to append to the action's flash ("" when nobody moved). `by` and `cause` (name-free,
 * e.g. "a cancellation") go to the attendee log's move-in row (D743).
 *
 * Not a server action: it lives outside a "use server" file so it cannot be called from the
 * browser with an event id of the caller's choosing. It reloads the event so a Settings save
 * that renamed it messages under the new name. Never throws: the organiser's own change has
 * already been saved, and the next trigger fills whatever this one could not.
 */
export async function afterPlacesChange(eventId: string, by: Actor, cause: string): Promise<string> {
  try {
    const ev = await getEvent(eventId);
    if (!ev) return "";
    const moved = await fillFreePlaces(ev.id);
    if (moved.length === 0) return "";
    // Logged before the messages go: the move-in has happened, whatever WhatsApp does next.
    const logged = await logMoveIns(ev.id, by, moved, cause);
    const sent = await notifyRegistered(ev, moved, "moved_in");
    return [await movedLine(moved, sent), logged].filter(Boolean).join(" ");
  } catch (e) {
    console.error("afterPlacesChange failed", e);
    return "The waiting list could not be moved along just now; it moves at the next change.";
  }
}
