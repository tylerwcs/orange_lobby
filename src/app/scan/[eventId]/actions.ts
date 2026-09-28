"use server";
import { requireAdmin } from "@/lib/auth";
import { requireEvent, getEventByCrewToken } from "@/lib/db/events";
import { findByToken, getAttendee, listAttendees } from "@/lib/db/attendees";
import { recordCheckin, listCheckedInAttendeeIds, deleteCheckin, getCheckin } from "@/lib/db/checkins";
import { getCheckpoint } from "@/lib/db/checkpoints";
import { bookedSessionOn, bookerIdsOn } from "@/lib/db/activities";
import { loadBoard } from "@/lib/db/doors";
import { settleRequestsAtDoor } from "@/lib/db/activity-requests";
import { slotTime, type Board } from "@/lib/booking-door";
import { extractToken, scanResultFields } from "@/lib/scan";
import { fieldValue } from "@/lib/attendee-values";
import { eventFields } from "@/lib/attendee-fields";
import { crewLinkLive } from "@/lib/crew";
import { isValidToken } from "@/lib/tokens";
import { allow } from "@/lib/ratelimit";
import { nowInKL } from "@/lib/time";
import type { Attendee, Checkpoint, Event } from "@/lib/types";

export type ScanResult = {
  status: "ok" | "duplicate" | "notfound" | "error" | "undone" | "not_booked";
  attendee?: Attendee; fields?: { label: string; value: string }[]; earlier?: { at: string }; message?: string;
};

/** `booked` is null at an ordinary door, where there is nothing to have booked. */
export type SearchHit = Pick<Attendee, "id" | "name" | "category"> & { table_no: string | null; checkedIn: boolean; booked: boolean | null };

/**
 * Two doors into the same scanner (D110).
 *
 * A signed-in admin is the door that has always been here. A crew token is the new one: the
 * holder of a printed or forwarded link, with no account at all. `userId` is null for them,
 * which is what lands in `checkins.scanned_by` — the same value all 149 existing rows carry
 * (D105).
 *
 * Fails closed. A crew token that is malformed, unknown, for another event, or past its last
 * day never falls through to the admin path: if a token was offered, it is the only thing that
 * can authorise this call.
 *
 * The two branches fail differently on purpose. The admin branch still throws —
 * `requireAdmin` redirects to login and `requireEvent` calls `notFound()`, both correct for
 * someone with a session who is simply on the wrong page. The crew branch returns an `error`
 * instead of throwing `notFound()`, because every caller here is a server action, not a page
 * render: `Scanner.tsx` wraps each call in `try/catch` and a caught `notFound()` never
 * produces its redirect — it just looks like a throw, so the crew branch's refusal has to
 * travel back as data or it is indistinguishable from a dropped connection.
 */
async function authorise(eventId: string, crewToken?: string): Promise<{ ev: Event; userId: string | null } | { error: string }> {
  if (crewToken) {
    if (!isValidToken(crewToken)) return { error: "This scanner link isn't valid. Ask the organiser for the right one." };
    // Rate-limited by token, as the booth route is. `allow` is an in-memory Map, so on Vercel
    // this is per-instance and therefore weak — a speed bump against a loop, not the control.
    // The budget itself is larger than the booth's 120/min: a door reads one badge per person
    // through a queue and can burst faster than a stand's steadier trickle of visitors.
    if (!allow(`crew:${crewToken}`, 240, 60_000)) return { error: "Too many scans at once. Wait a moment and try again." };
    const ev = await getEventByCrewToken(crewToken);
    if (!ev || ev.id !== eventId) return { error: "This scanner link no longer works. Ask the organiser for a new one." };
    if (!crewLinkLive(ev, nowInKL().date)) return { error: "This scanner link has expired. Ask the organiser for a new one." };
    return { ev, userId: null };
  }
  const { orgId, userId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  return { ev, userId };
}

async function doCheckin(ev: Event, userId: string | null, checkpointId: string, attendee: Attendee, walkIn = false): Promise<ScanResult> {
  if (ev.status === "archived") return { status: "error", message: "This event is archived, so check-in is closed." };
  // Beside the archived check because it is the same kind of refusal, and here rather than
  // only on the page because this is the one place a checkin is written (D159). The page
  // refuses a reader; this refuses a POST — a crew phone with the scanner still open when
  // the organiser switches check-in off would otherwise keep recording.
  if (!ev.check_in_enabled) return { status: "error", message: "Check-in is off for this event." };
  const checkpoint = await getCheckpoint(checkpointId, ev.id);
  if (!checkpoint) return { status: "error", message: "This checkpoint no longer exists. Go back and pick another." };
  const fields = scanResultFields(attendee, ev);
  if (checkpoint.activity_id) {
    // A booking door (D324): say which slot they booked, and stop to ask about anyone who
    // booked none that day (D326). Someone already let in is "Already in", not asked again.
    const slot = await bookedSessionOn(attendee.id, checkpoint.activity_id, checkpoint.day);
    if (!slot && !walkIn) {
      const existing = await getCheckin(checkpointId, attendee.id);
      if (existing) return { status: "duplicate", attendee, fields: [{ label: "Booked", value: "Walk-in" }, ...fields], earlier: { at: existing.scanned_at } };
      return { status: "not_booked", attendee, fields };
    }
    fields.unshift({ label: "Booked", value: slot ? slotTime(slot) : "Walk-in" });
  }
  const r = await recordCheckin(ev, checkpointId, attendee.id, userId);
  if (r.created) await settleAtDoor(checkpoint, attendee.id, "closed", userId);
  return r.created ? { status: "ok", attendee, fields } : { status: "duplicate", attendee, fields, earlier: { at: r.existing!.scanned_at } };
}

/**
 * D343: arriving closes a pending request to move or cancel this session; undoing reopens it.
 * The check-in (or its undo) is already saved when this runs, so a failure here is logged
 * rather than turned into an error card - crew would read that as "not checked in" and scan
 * again, and the request is still there for the committee to decide by hand.
 */
async function settleAtDoor(checkpoint: Checkpoint, attendeeId: string, to: "closed" | "pending", userId: string | null) {
  try {
    await settleRequestsAtDoor(checkpoint, [attendeeId], to, userId);
  } catch (e) {
    console.error(`D343: could not ${to === "closed" ? "close" : "reopen"} requests at checkpoint ${checkpoint.id} for ${attendeeId}`, e);
  }
}

export async function checkInByTokenAction(eventId: string, checkpointId: string, scanned: string, crewToken?: string): Promise<ScanResult> {
  const auth = await authorise(eventId, crewToken);
  if ("error" in auth) return { status: "error", message: auth.error };
  const { ev, userId } = auth;
  const token = extractToken(scanned);
  if (!token) return { status: "notfound", message: "That code isn't an attendee badge. Try the name search." };
  const a = await findByToken(eventId, token);
  if (!a) return { status: "notfound", message: "This badge isn't on the list for this event. Try the name search." };
  return doCheckin(ev, userId, checkpointId, a);
}

/** `walkIn` is the crew's "Let them in anyway" after a `not_booked` answer (D326). */
export async function checkInByIdAction(eventId: string, checkpointId: string, attendeeId: string, crewToken?: string, walkIn = false): Promise<ScanResult> {
  const auth = await authorise(eventId, crewToken);
  if ("error" in auth) return { status: "error", message: auth.error };
  const { ev, userId } = auth;
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== eventId) return { status: "notfound", message: "That attendee is no longer on the list." };
  return doCheckin(ev, userId, checkpointId, a, walkIn);
}

export async function undoCheckinAction(eventId: string, checkpointId: string, attendeeId: string, crewToken?: string): Promise<ScanResult> {
  const auth = await authorise(eventId, crewToken);
  if ("error" in auth) return { status: "error", message: auth.error };
  const { ev } = auth;
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== ev.id) return { status: "error", message: "That attendee is no longer on the list." };
  const removed = await deleteCheckin(ev.id, checkpointId, attendeeId);
  if (removed) {
    const checkpoint = await getCheckpoint(checkpointId, ev.id);
    if (checkpoint) await settleAtDoor(checkpoint, attendeeId, "pending", null);
  }
  return removed ? { status: "undone", attendee: a } : { status: "error", message: "Nothing to undo." };
}

/**
 * A booking door's board, re-read by its scanner every 15 seconds and after each of its own
 * scans (D332). Null for an ordinary door, and once the door can no longer be scanned —
 * archived, check-in off, the checkpoint gone, a crew link refused — so the scanner keeps its
 * last list and says "Paused" rather than showing one it is no longer allowed to act on.
 */
export async function loadBoardAction(eventId: string, checkpointId: string, crewToken?: string): Promise<Board | null> {
  const auth = await authorise(eventId, crewToken);
  if ("error" in auth) return null;
  const { ev } = auth;
  if (ev.status === "archived" || !ev.check_in_enabled) return null;
  const checkpoint = await getCheckpoint(checkpointId, ev.id);
  if (!checkpoint?.activity_id) return null;
  return loadBoard(ev.id, checkpoint, nowInKL());
}

export async function searchAttendeesAction(eventId: string, q: string, checkpointId: string, crewToken?: string): Promise<SearchHit[]> {
  const auth = await authorise(eventId, crewToken);
  if ("error" in auth) return [];
  const { ev } = auth;
  if (q.trim().length < 2) return [];
  const [rows, checkedIn, checkpoint] = await Promise.all([
    listAttendees(eventId, q),
    listCheckedInAttendeeIds(checkpointId),
    getCheckpoint(checkpointId, ev.id),
  ]);
  // Only a booking door has bookers to read, so an ordinary door's search stays one round trip.
  const bookers = checkpoint?.activity_id ? await bookerIdsOn(checkpoint.activity_id, checkpoint.day) : null;
  // A fact this event does not collect must not reach a crew member's phone at all, rather
  // than being filtered out once it is there. Whether it collects a fact is answered the
  // same way everywhere else in this migration: whether a field for it exists.
  const fields = eventFields(ev.registration_questions, ev.attendee_fields);
  const has = (key: string) => fields.some((f) => f.key === key);
  return rows.slice(0, 20).map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    table_no: has("table_no") ? fieldValue(a, "table_no") || null : null,
    checkedIn: checkedIn.has(a.id),
    booked: bookers ? bookers.has(a.id) : null,
  }));
}
