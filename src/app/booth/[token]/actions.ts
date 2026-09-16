"use server";
import { getEvent } from "@/lib/db/events";
import { findByToken, getAttendee, listAttendees } from "@/lib/db/attendees";
import { listBooths, getBoothByToken, recordStamp, deleteStamp, stampsForAttendee } from "@/lib/db/booths";
import { buildPassport, progressLine } from "@/lib/booths";
import { extractToken } from "@/lib/scan";
import { isValidToken } from "@/lib/tokens";
import { allow } from "@/lib/ratelimit";
import type { Booth, Event } from "@/lib/types";

/**
 * What crosses the wire to a booth: a name, and how far along that person is (D98).
 *
 * There is deliberately no `attendee` here. The crew scanner returns the whole row because a
 * door is identifying a guest; a booth is a stranger's stand, and after KOM it is a third
 * party. Keeping the shape this narrow means no component can leak a field by accident.
 */
export type BoothScanResult = {
  status: "ok" | "duplicate" | "notfound" | "error" | "undone";
  name?: string;
  attendeeId?: string;
  progress?: string;
  collected?: number;
  target?: number;
  earlier?: { at: string };
  message?: string;
};

export type BoothHit = { id: string; name: string; category: string | null };

/**
 * The booth token IS the authorisation (D91). No session, no org membership: whoever holds
 * the printed sheet may stamp, and may do nothing else.
 *
 * Rate-limited by token. `allow` is an in-memory Map, so on Vercel this is per-instance and
 * therefore weak — the same limit registration already relies on. It is a speed bump against
 * a loop, not a security control; the control is the 12-character token.
 */
async function authoriseBooth(boothToken: string): Promise<{ booth: Booth; event: Event } | { error: string }> {
  if (!isValidToken(boothToken)) return { error: "This scanner link is not valid." };
  if (!allow(`booth:${boothToken}`, 120, 60_000)) return { error: "Too many scans at once. Wait a moment and try again." };
  const booth = await getBoothByToken(boothToken);
  if (!booth) return { error: "This scanner link no longer works. Ask the organiser for a new one." };
  const event = await getEvent(booth.event_id);
  if (!event) return { error: "This scanner link no longer works. Ask the organiser for a new one." };
  if (event.status === "archived") return { error: "This event is closed, so stamping has finished." };
  return { booth, event };
}

/** The progress line for one attendee, computed after the write so the booth sees the new total. */
async function progressFor(event: Event, attendeeId: string): Promise<Pick<BoothScanResult, "progress" | "collected" | "target">> {
  const [booths, stamps] = await Promise.all([listBooths(event.id), stampsForAttendee(attendeeId)]);
  const p = buildPassport(booths, stamps, event.stamps_required);
  return { progress: progressLine(p), collected: p.collected, target: p.target };
}

async function stamp(booth: Booth, event: Event, attendeeId: string, name: string): Promise<BoothScanResult> {
  const r = await recordStamp(booth, attendeeId);
  const progress = await progressFor(event, attendeeId);
  return r.created
    ? { status: "ok", name, attendeeId, ...progress }
    : { status: "duplicate", name, attendeeId, ...progress, earlier: { at: r.existing!.stamped_at } };
}

export async function stampByTokenAction(boothToken: string, scanned: string): Promise<BoothScanResult> {
  const auth = await authoriseBooth(boothToken);
  if ("error" in auth) return { status: "error", message: auth.error };
  const token = extractToken(scanned);
  if (!token) return { status: "notfound", message: "That code isn't an attendee badge. Try the name search." };
  const a = await findByToken(auth.event.id, token);
  // A booth cannot create attendees (D99): an unknown badge is sent to registration, not added.
  if (!a) return { status: "notfound", message: "This badge isn't on the list for this event. Please see registration." };
  return stamp(auth.booth, auth.event, a.id, a.name);
}

export async function stampByIdAction(boothToken: string, attendeeId: string): Promise<BoothScanResult> {
  const auth = await authoriseBooth(boothToken);
  if ("error" in auth) return { status: "error", message: auth.error };
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== auth.event.id) return { status: "notfound", message: "That attendee is no longer on the list." };
  return stamp(auth.booth, auth.event, a.id, a.name);
}

export async function undoStampAction(boothToken: string, attendeeId: string): Promise<BoothScanResult> {
  const auth = await authoriseBooth(boothToken);
  if ("error" in auth) return { status: "error", message: auth.error };
  const removed = await deleteStamp(auth.booth.id, attendeeId);
  if (!removed) return { status: "error", message: "Nothing to undo." };
  const a = await getAttendee(attendeeId);
  return { status: "undone", name: a?.name, attendeeId };
}

/**
 * The fallback when a camera will not start (D99). Name and category only — enough to tell two
 * Sarahs apart, and nothing a booth could harvest. The fields are dropped here, on the server,
 * rather than filtered in the component, so they never reach the booth's phone at all.
 */
export async function searchForBoothAction(boothToken: string, q: string): Promise<BoothHit[]> {
  const auth = await authoriseBooth(boothToken);
  if ("error" in auth) return [];
  if (q.trim().length < 2) return [];
  const rows = await listAttendees(auth.event.id, q, "name");
  return rows.slice(0, 20).map((a) => ({ id: a.id, name: a.name, category: a.category }));
}
