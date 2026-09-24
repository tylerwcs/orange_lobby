import type { Activity, Booth, BoothStamp } from "@/lib/types";

export type PassportCell = { booth: Booth; stampedAt: string | null };

export type Passport = {
  /** Every booth this passport has, in admin order — unstamped ones included (D102). */
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
 * One attendee's card. Takes one passport's booths and only that attendee's stamps.
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

/**
 * The one line the card and the booth scanner both show.
 *
 * When complete, drops the fraction `X of Y` because a target below the booth count means
 * an attendee can keep collecting after hitting the target — `"5 of 3"` reads as broken.
 * The true count feeds the export and the admin's data; the display just says the card is full.
 */
export function progressLine(p: Pick<Passport, "collected" | "target" | "remaining" | "complete">): string {
  if (p.target === 0) return "No booths yet";
  if (p.complete) return `Card full · ${p.collected} stamp${p.collected === 1 ? "" : "s"}`;
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

/**
 * The passport an old, kind-less link means: `/stamps`, the signage QR, the "stamps" tile
 * (D191). The first by the order it is given in, which is `listActivities`' own sort order.
 */
export function firstPassport<T extends Pick<Activity, "kind">>(activities: T[]): T | null {
  return activities.find((a) => a.kind === "passport") ?? null;
}

/**
 * Each passport's booth count and how many attendees have filled its card, for the activity
 * list. Goes through `completionByAttendee` per passport rather than counting here, because
 * that is the one place "complete" is decided — the export and the passport page read it too.
 */
export function passportRollup(
  passports: Pick<Activity, "id" | "stamps_required">[],
  booths: Booth[],
  stamps: BoothStamp[],
): Record<string, { booths: number; completed: number }> {
  const out: Record<string, { booths: number; completed: number }> = {};
  for (const p of passports) {
    const mine = booths.filter((b) => b.activity_id === p.id);
    const completion = completionByAttendee(mine, stamps, p.stamps_required);
    out[p.id] = { booths: mine.length, completed: [...completion.values()].filter((c) => c.complete).length };
  }
  return out;
}

/**
 * The target and the message as an organiser typed them (D95, D96). A blank target is null,
 * which means every booth — clearing the box is an answer, not a mistake.
 *
 * `boothCount` is null when the passport is being created and has no booths to bound the
 * target by; `stampsTarget` clamps it on read until they exist.
 */
export function readPassportSettings(
  raw: { stamps_required: string; reward_message: string },
  boothCount: number | null,
): { stamps_required: number | null; reward_message: string | null } {
  const typed = raw.stamps_required.trim();
  let stamps_required: number | null = null;
  if (typed !== "") {
    const n = Number(typed);
    if (!Number.isInteger(n) || n < 1) throw new Error("Stamps needed must be a whole number, or blank for every booth.");
    if (boothCount !== null && n > boothCount) {
      throw new Error(`This passport has ${boothCount} booth${boothCount === 1 ? "" : "s"}, so the target cannot be ${n}.`);
    }
    stamps_required = n;
  }
  return { stamps_required, reward_message: raw.reward_message.trim() || null };
}
