import type { ActivityBooking, ActivitySession, Checkin, Checkpoint } from "@/lib/types";

/**
 * Booking doors (D324-D331): a checkpoint that stands for one booking activity on one day.
 * Everything here is pure. The pages load rows; these decide who was expected, who came,
 * who walked in and which slot is running.
 */

export type Now = { date: string; time: string };
export type SlotPhase = "now" | "next" | "later" | "earlier";
export type BoardPerson = { id: string; name: string; arrivedAt: string | null; noShow: boolean };
export type BoardSlot = {
  id: string;
  time: string;
  location: string | null;
  phase: SlotPhase;
  people: BoardPerson[];
  arrived: number;
  noShows: number;
};
export type WalkIn = { id: string; name: string; at: string };
export type Board = { slots: BoardSlot[]; walkIns: WalkIn[]; arrived: number; expected: number };
/** A door's "n of m": booked arrivals over bookers, or every check-in over everyone registered (D331). */
export type DoorTally = { arrived: number; expected: number; walkIns: number };

type Slot = Pick<ActivitySession, "id" | "starts_at" | "ends_at">;
type Arrival = Pick<Checkin, "attendee_id" | "scanned_at">;
type Booked = Pick<ActivityBooking, "session_id" | "attendee_id">;
type Door = Pick<Checkpoint, "id" | "activity_id" | "day">;

const byTime = (a: ActivitySession, b: ActivitySession) => a.starts_at.localeCompare(b.starts_at) || a.sort_order - b.sort_order;

/** "10:30–10:45", or "10:30" when a session has no end. */
export function slotTime(s: Pick<ActivitySession, "starts_at" | "ends_at">): string {
  return s.ends_at ? `${s.starts_at}–${s.ends_at}` : s.starts_at;
}

/** D330. When each slot has ended: its own end, else the next start that day, else never (null). */
export function slotEnds(sessions: Slot[]): Map<string, string | null> {
  const starts = [...new Set(sessions.map((s) => s.starts_at))].sort();
  return new Map(sessions.map((s): [string, string | null] => [s.id, s.ends_at ?? starts.find((t) => t > s.starts_at) ?? null]));
}

/** The sessions a door covers: its activity, on its day, in time order. None for an ordinary door. */
export function doorSessions(cp: Pick<Checkpoint, "activity_id" | "day">, sessions: ActivitySession[]): ActivitySession[] {
  if (!cp.activity_id) return [];
  return sessions.filter((s) => s.activity_id === cp.activity_id && s.day === cp.day).sort(byTime);
}

/**
 * Which slots are running, coming up or over, by Malaysian wall clock. A door dated before
 * today is all over; one dated after today has not started. "Next" is every slot sharing the
 * earliest start still to come, so parallel rooms appear together.
 */
export function slotPhases(sessions: Slot[], day: string, now: Now): Map<string, SlotPhase> {
  if (day < now.date) return new Map(sessions.map((s): [string, SlotPhase] => [s.id, "earlier"]));
  if (day > now.date) return new Map(sessions.map((s): [string, SlotPhase] => [s.id, "later"]));
  const ends = slotEnds(sessions);
  const next = sessions.filter((s) => s.starts_at > now.time).map((s) => s.starts_at).sort()[0];
  return new Map(sessions.map((s): [string, SlotPhase] => {
    const end = ends.get(s.id) ?? null;
    if (end !== null && end <= now.time) return [s.id, "earlier"];
    if (s.starts_at <= now.time) return [s.id, "now"];
    return [s.id, s.starts_at === next ? "next" : "later"];
  }));
}

/** Each attendee's first arrival. One door holds one per person, but two doors on a day can hold two. */
function firstArrivals(checkins: Arrival[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of checkins) {
    const had = out.get(c.attendee_id);
    if (!had || c.scanned_at < had) out.set(c.attendee_id, c.scanned_at);
  }
  return out;
}

/**
 * What a booking door's crew sees: every slot with its bookers and who has arrived, the
 * walk-ins, and the count. `bookings` may hold other sessions' rows; only these sessions'
 * are read. Arrival is per door, not per slot (D328).
 */
export function doorBoard({ day, sessions, bookings, checkins, names, now }: {
  day: string;
  sessions: ActivitySession[];
  bookings: Booked[];
  checkins: Arrival[];
  names: ReadonlyMap<string, string>;
  now: Now;
}): Board {
  const ordered = [...sessions].sort(byTime);
  const phases = slotPhases(ordered, day, now);
  const arrivals = firstArrivals(checkins);
  const nameOf = (id: string) => names.get(id) ?? "Unknown";
  const bookers = new Set<string>();
  const slots = ordered.map((s): BoardSlot => {
    const phase = phases.get(s.id) ?? "later";
    const people = bookings.filter((bk) => bk.session_id === s.id).map((bk): BoardPerson => {
      bookers.add(bk.attendee_id);
      const arrivedAt = arrivals.get(bk.attendee_id) ?? null;
      return { id: bk.attendee_id, name: nameOf(bk.attendee_id), arrivedAt, noShow: phase === "earlier" && arrivedAt === null };
    }).sort((x, y) => x.name.localeCompare(y.name));
    return {
      id: s.id, time: slotTime(s), location: s.location, phase, people,
      arrived: people.filter((p) => p.arrivedAt !== null).length,
      noShows: people.filter((p) => p.noShow).length,
    };
  });
  const walkIns = [...arrivals].filter(([id]) => !bookers.has(id))
    .map(([id, at]) => ({ id, name: nameOf(id), at }))
    .sort((x, y) => x.at.localeCompare(y.at));
  return { slots, walkIns, arrived: [...bookers].filter((id) => arrivals.has(id)).length, expected: bookers.size };
}

/** Every door's "n of m" (D331), so the door list, the scanner header, Settings and the Overview agree. */
export function doorTallies(
  checkpoints: Door[],
  checkins: Pick<Checkin, "checkpoint_id" | "attendee_id">[],
  sessions: ActivitySession[],
  bookings: Booked[],
  registered: number,
): Record<string, DoorTally> {
  const byDoor = new Map<string, string[]>();
  for (const c of checkins) {
    const list = byDoor.get(c.checkpoint_id);
    if (list) list.push(c.attendee_id); else byDoor.set(c.checkpoint_id, [c.attendee_id]);
  }
  const out: Record<string, DoorTally> = {};
  for (const cp of checkpoints) {
    const here = byDoor.get(cp.id) ?? [];
    if (!cp.activity_id) { out[cp.id] = { arrived: here.length, expected: registered, walkIns: 0 }; continue; }
    // One statement of which sessions a door covers (D324), shared with boardsByDay.
    const ids = new Set(doorSessions(cp, sessions).map((s) => s.id));
    const bookers = new Set(bookings.filter((bk) => ids.has(bk.session_id)).map((bk) => bk.attendee_id));
    const arrived = here.filter((id) => bookers.has(id)).length;
    out[cp.id] = { arrived, expected: bookers.size, walkIns: here.length - arrived };
  }
  return out;
}

/**
 * The Bookings tab's marks: one board per day that has a door for this activity. Two doors
 * for the same activity on one day read as one; the earlier arrival wins.
 */
export function boardsByDay(
  activityId: string,
  checkpoints: Door[],
  checkins: Pick<Checkin, "checkpoint_id" | "attendee_id" | "scanned_at">[],
  sessions: ActivitySession[],
  bookings: Booked[],
  names: ReadonlyMap<string, string>,
  now: Now,
): Map<string, Board> {
  const doors = checkpoints.filter((c) => c.activity_id === activityId);
  const out = new Map<string, Board>();
  for (const day of [...new Set(doors.map((d) => d.day))].sort()) {
    const ids = new Set(doors.filter((d) => d.day === day).map((d) => d.id));
    out.set(day, doorBoard({
      day,
      sessions: doorSessions({ activity_id: activityId, day }, sessions),
      bookings,
      checkins: checkins.filter((c) => ids.has(c.checkpoint_id)),
      names,
      now,
    }));
  }
  return out;
}
