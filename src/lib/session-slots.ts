import type { ActivitySession } from "@/lib/types";
import type { SessionSeats } from "@/lib/activities";

/**
 * The bulk "Add sessions" maths (D241), and the day grouping the Setup tab shows (D240).
 *
 * Pure, so the rules a slot is kept or dropped by are tested here rather than discovered on the
 * day. The dialog runs this same function to show "Makes 32 sessions" before anything is sent.
 */

export const MAX_SLOTS = 200;

export type SlotInput = {
  days: string[];
  from: string;
  to: string;
  /** Minutes per session, which is also the step between starts. */
  every: number;
  breaks: { from: string; to: string }[];
  capacity: number;
  location: string | null;
};

export type NewSlot = { day: string; starts_at: string; ends_at: string; location: string | null; capacity: number };
export type SlotPlan = { ok: true; slots: NewSlot[]; skipped: number } | { ok: false; error: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const refuse = (error: string): SlotPlan => ({ ok: false, error });

/**
 * Every session the input describes, minus the ones this activity already has.
 *
 * Starts step from `from` by `every`; a slot is kept only if it ends by `to` and does not touch
 * a break at all. Stepping from `from` rather than restarting at the break's end keeps the grid
 * regular: 20-minute slots with lunch 13:00–14:00 resume at 14:00, not at some odd minute.
 *
 * Over the cap is refused, not cut short: silently making the first 200 of 280 would look like
 * success and leave the last afternoon missing.
 */
export function generateSlots(input: SlotInput, existing: Pick<ActivitySession, "day" | "starts_at">[] = []): SlotPlan {
  const days = [...new Set(input.days.filter(Boolean))].sort();
  if (days.length === 0) return refuse("Pick at least one day");
  if (days.some((d) => !DATE.test(d))) return refuse("One of the days is not a date");
  if (!TIME.test(input.from) || !TIME.test(input.to)) return refuse("Give a start and an end time");
  const from = toMinutes(input.from), to = toMinutes(input.to);
  if (from >= to) return refuse("The end time must be after the start time");
  if (!Number.isInteger(input.every) || input.every < 5 || input.every > 240) return refuse("Each session must last between 5 and 240 minutes");
  if (!Number.isInteger(input.capacity) || input.capacity < 1) return refuse("Seats must be at least 1");

  const breaks: [number, number][] = [];
  for (const b of input.breaks) {
    if (!b.from && !b.to) continue;
    if (!TIME.test(b.from) || !TIME.test(b.to) || toMinutes(b.from) >= toMinutes(b.to)) {
      return refuse("A break needs a start and an end, in that order");
    }
    breaks.push([toMinutes(b.from), toMinutes(b.to)]);
  }

  const taken = new Set(existing.map((s) => `${s.day} ${s.starts_at}`));
  const slots: NewSlot[] = [];
  let skipped = 0;
  for (const day of days) {
    for (let start = from; start + input.every <= to; start += input.every) {
      const end = start + input.every;
      if (breaks.some(([bFrom, bTo]) => start < bTo && end > bFrom)) continue;
      if (taken.has(`${day} ${toTime(start)}`)) { skipped++; continue; }
      slots.push({ day, starts_at: toTime(start), ends_at: toTime(end), location: input.location, capacity: input.capacity });
      if (slots.length > MAX_SLOTS) return refuse(`That makes more than ${MAX_SLOTS} sessions. Split it into smaller batches.`);
    }
  }
  if (slots.length === 0) return refuse(skipped > 0 ? "Those sessions all exist already" : "No session fits between those times");
  return { ok: true, slots, skipped };
}

/** The dialog's fields. `day`, `break_from` and `break_to` repeat, one per row. */
export function readSlotForm(fd: FormData): SlotInput {
  const text = (k: string) => String(fd.get(k) ?? "").trim();
  const all = (k: string) => fd.getAll(k).map((v) => String(v).trim());
  const breakTo = all("break_to");
  return {
    days: all("day").filter(Boolean),
    from: text("from"),
    to: text("to"),
    every: Number.parseInt(text("every"), 10),
    breaks: all("break_from").map((from, i) => ({ from, to: breakTo[i] ?? "" })),
    capacity: Number.parseInt(text("capacity"), 10),
    location: text("location") || null,
  };
}

export function describeAdded(added: number, skipped: number): string {
  const made = `Added ${added} session${added === 1 ? "" : "s"}.`;
  return skipped > 0 ? `${made} ${skipped} already existed.` : made;
}

export type DayGroup = { day: string; items: SessionSeats[]; booked: number; seats: number; location: string | null };

/**
 * Sessions as the Setup tab shows them: one section per day, in the order given (listSessions
 * already sorts by day then time). `location` is the one most of the day's sessions use, so a
 * row only has to name its room when it differs.
 */
export function groupSessionsByDay(items: SessionSeats[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    let g = groups.find((x) => x.day === item.session.day);
    if (!g) { g = { day: item.session.day, items: [], booked: 0, seats: 0, location: null }; groups.push(g); }
    g.items.push(item);
    g.booked += item.booked;
    g.seats += item.session.capacity;
  }
  for (const g of groups) {
    const tally = new Map<string | null, number>();
    for (const i of g.items) tally.set(i.session.location, (tally.get(i.session.location) ?? 0) + 1);
    g.location = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  return groups;
}
