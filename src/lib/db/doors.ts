import "server-only";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { countAttendees, listAttendeesByIds } from "@/lib/db/attendees";
import { listBookings, listSessions } from "@/lib/db/activities";
import { doorBoard, doorSessions, doorTallies, type Board, type DoorTally, type Now } from "@/lib/booking-door";
import type { ActivityBooking, ActivitySession, Checkin, Checkpoint } from "@/lib/types";

export type LoadedDoors = {
  cps: Checkpoint[];
  checkins: Checkin[];
  sessions: ActivitySession[];
  bookings: ActivityBooking[];
  registered: number;
  tallies: Record<string, DoorTally>;
};

/**
 * Every door of an event with its "n of m" (D331). Sessions and bookings are only read when
 * a booking door exists, so an event without one loads what it always did.
 */
export async function loadDoors(eventId: string): Promise<LoadedDoors> {
  const [cps, checkins, registered] = await Promise.all([listCheckpoints(eventId), listCheckinsForEvent(eventId), countAttendees(eventId)]);
  const [sessions, bookings]: [ActivitySession[], ActivityBooking[]] = cps.some((c) => c.activity_id)
    ? await Promise.all([listSessions(eventId), listBookings(eventId)])
    : [[], []];
  return { cps, checkins, sessions, bookings, registered, tallies: doorTallies(cps, checkins, sessions, bookings, registered) };
}

/** A booking door's board (D324), or null for an ordinary door. Names are read for the people on it only. */
export async function loadBoard(eventId: string, cp: Checkpoint, doors: LoadedDoors, now: Now): Promise<Board | null> {
  if (!cp.activity_id) return null;
  const sessions = doorSessions(cp, doors.sessions);
  const ids = new Set(sessions.map((s) => s.id));
  const bookings = doors.bookings.filter((b) => ids.has(b.session_id));
  const checkins = doors.checkins.filter((c) => c.checkpoint_id === cp.id);
  const people = await listAttendeesByIds(eventId, [...bookings.map((b) => b.attendee_id), ...checkins.map((c) => c.attendee_id)]);
  return doorBoard({ day: cp.day, sessions, bookings, checkins, names: new Map(people.map((a) => [a.id, a.name])), now });
}
