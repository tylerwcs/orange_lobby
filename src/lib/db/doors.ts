import "server-only";
import { listCheckpoints } from "@/lib/db/checkpoints";
import { listCheckinsForEvent } from "@/lib/db/checkins";
import { countAttendees } from "@/lib/db/attendees";
import { listBookings, listSessions } from "@/lib/db/activities";
import { doorTallies, type DoorTally } from "@/lib/booking-door";
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
