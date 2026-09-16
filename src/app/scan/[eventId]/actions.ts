"use server";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { requireEvent, getEventByCrewToken } from "@/lib/db/events";
import { findByToken, getAttendee, listAttendees } from "@/lib/db/attendees";
import { recordCheckin, listCheckedInAttendeeIds, deleteCheckin } from "@/lib/db/checkins";
import { getCheckpoint } from "@/lib/db/checkpoints";
import { extractToken, scanResultFields } from "@/lib/scan";
import { crewLinkLive } from "@/lib/crew";
import { isValidToken } from "@/lib/tokens";
import { allow } from "@/lib/ratelimit";
import { nowInKL } from "@/lib/time";
import type { Attendee, Event } from "@/lib/types";

export type ScanResult = {
  status: "ok" | "duplicate" | "notfound" | "error" | "undone";
  attendee?: Attendee; fields?: { label: string; value: string }[]; earlier?: { at: string }; message?: string;
};

export type SearchHit = Pick<Attendee, "id" | "name" | "company" | "category" | "table_no"> & { checkedIn: boolean };

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
 */
async function authorise(eventId: string, crewToken?: string): Promise<{ ev: Event; userId: string | null }> {
  if (crewToken) {
    if (!isValidToken(crewToken)) notFound();
    // Rate-limited by token, as the booth route is. `allow` is an in-memory Map, so on Vercel
    // this is per-instance and therefore weak — a speed bump against a loop, not the control.
    if (!allow(`crew:${crewToken}`, 240, 60_000)) notFound();
    const ev = await getEventByCrewToken(crewToken);
    if (!ev || ev.id !== eventId) notFound();
    if (!crewLinkLive(ev, nowInKL().date)) notFound();
    return { ev, userId: null };
  }
  const { orgId, userId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  return { ev, userId };
}

async function doCheckin(ev: Event, userId: string | null, checkpointId: string, attendee: Attendee): Promise<ScanResult> {
  if (ev.status === "archived") return { status: "error", message: "This event is archived, so check-in is closed." };
  const checkpoint = await getCheckpoint(checkpointId, ev.id);
  if (!checkpoint) return { status: "error", message: "This checkpoint no longer exists. Go back and pick another." };
  const r = await recordCheckin(ev, checkpointId, attendee.id, userId);
  const fields = scanResultFields(attendee, ev);
  return r.created ? { status: "ok", attendee, fields } : { status: "duplicate", attendee, fields, earlier: { at: r.existing!.scanned_at } };
}

export async function checkInByTokenAction(eventId: string, checkpointId: string, scanned: string, crewToken?: string): Promise<ScanResult> {
  const { ev, userId } = await authorise(eventId, crewToken);
  const token = extractToken(scanned);
  if (!token) return { status: "notfound", message: "That code isn't an attendee badge. Try the name search." };
  const a = await findByToken(eventId, token);
  if (!a) return { status: "notfound", message: "This badge isn't on the list for this event. Try the name search." };
  return doCheckin(ev, userId, checkpointId, a);
}

export async function checkInByIdAction(eventId: string, checkpointId: string, attendeeId: string, crewToken?: string): Promise<ScanResult> {
  const { ev, userId } = await authorise(eventId, crewToken);
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== eventId) return { status: "notfound", message: "That attendee is no longer on the list." };
  return doCheckin(ev, userId, checkpointId, a);
}

export async function undoCheckinAction(eventId: string, checkpointId: string, attendeeId: string, crewToken?: string): Promise<ScanResult> {
  const { ev } = await authorise(eventId, crewToken);
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== ev.id) return { status: "error", message: "That attendee is no longer on the list." };
  const removed = await deleteCheckin(ev.id, checkpointId, attendeeId);
  return removed ? { status: "undone", attendee: a } : { status: "error", message: "Nothing to undo." };
}

export async function searchAttendeesAction(eventId: string, q: string, checkpointId: string, crewToken?: string): Promise<SearchHit[]> {
  const { ev } = await authorise(eventId, crewToken);
  if (q.trim().length < 2) return [];
  const [rows, checkedIn] = await Promise.all([listAttendees(eventId, q), listCheckedInAttendeeIds(checkpointId)]);
  // A field this event does not collect never reaches the crew's phone at all, rather than
  // being filtered out once it is there. The subtitle under a search hit is built from
  // whatever survives, so nulling it here is enough — and it keeps the wire honest.
  const collects = new Set<string>(ev.collected_fields);
  return rows.slice(0, 20).map((a) => ({
    id: a.id,
    name: a.name,
    company: collects.has("company") ? a.company : null,
    category: a.category,
    table_no: collects.has("table_no") ? a.table_no : null,
    checkedIn: checkedIn.has(a.id),
  }));
}
