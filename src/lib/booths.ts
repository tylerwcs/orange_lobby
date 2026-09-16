import type { Booth, BoothStamp } from "@/lib/types";

export type PassportCell = { booth: Booth; stampedAt: string | null };

export type Passport = {
  /** Every booth this event has, in admin order — unstamped ones included (D102). */
  cells: PassportCell[];
  collected: number;
  target: number;
  remaining: number;
  complete: boolean;
  /** When the card filled: the time of the target-th stamp, not of the latest one. */
  completedAt: string | null;
};

/**
 * How many stamps this event asks for.
 *
 * Clamped to the booths that actually exist, because `stamps_required` is a number an
 * organiser typed and a booth can be deleted after they typed it — and "7 of 5" on an
 * attendee's phone is a card that can never be finished.
 */
export function stampsTarget(boothCount: number, required: number | null): number {
  if (boothCount === 0) return 0;
  if (required === null || required <= 0) return boothCount;
  return Math.min(required, boothCount);
}

/**
 * One attendee's card. Takes the event's booths and only that attendee's stamps.
 *
 * A stamp whose booth is gone is ignored rather than counted: it can only exist if a booth
 * was deleted before its first stamp check, and counting it would let the total exceed the
 * number of cells on screen.
 */
export function buildPassport(booths: Booth[], stamps: BoothStamp[], required: number | null): Passport {
  const byBooth = new Map(stamps.map((s) => [s.booth_id, s]));
  const cells: PassportCell[] = booths.map((b) => ({ booth: b, stampedAt: byBooth.get(b.id)?.stamped_at ?? null }));
  const times = cells.map((c) => c.stampedAt).filter((t): t is string => t !== null).sort();
  const target = stampsTarget(booths.length, required);
  const collected = times.length;
  const complete = target > 0 && collected >= target;
  return {
    cells,
    collected,
    target,
    remaining: Math.max(0, target - collected),
    complete,
    completedAt: complete ? times[target - 1] : null,
  };
}

/** The one line the card and the booth scanner both show. */
export function progressLine(p: Pick<Passport, "collected" | "target" | "remaining" | "complete">): string {
  if (p.target === 0) return "No booths yet";
  if (p.complete) return `${p.collected} of ${p.target} · card full`;
  return `${p.collected} of ${p.target} · ${p.remaining} more to go`;
}

/**
 * Every attendee who has at least one stamp, with how far along they are. Feeds the admin's
 * completed count and the passport export; an attendee with no stamps has no entry, and the
 * callers treat a missing entry as zero.
 */
export function completionByAttendee(
  booths: Booth[],
  stamps: BoothStamp[],
  required: number | null,
): Map<string, { collected: number; complete: boolean }> {
  const live = new Set(booths.map((b) => b.id));
  const target = stampsTarget(booths.length, required);
  const counts = new Map<string, number>();
  for (const s of stamps) {
    if (!live.has(s.booth_id)) continue;
    counts.set(s.attendee_id, (counts.get(s.attendee_id) ?? 0) + 1);
  }
  const out = new Map<string, { collected: number; complete: boolean }>();
  for (const [attendeeId, collected] of counts) {
    out.set(attendeeId, { collected, complete: target > 0 && collected >= target });
  }
  return out;
}
