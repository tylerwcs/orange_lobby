# Booking Door Check-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A checkpoint can stand for a booking activity on its day. Its scanner lists who booked each slot, lets crew mark arrivals, warns before letting in someone who didn't book, and shows no-shows. The activity's Bookings tab shows the same marks.

**Architecture:**
- One nullable column, `checkpoints.activity_id`.
- Every "who is expected / who came" answer comes from pure functions in `src/lib/booking-door.ts`, fed by rows the pages already load.
- A server loader, `src/lib/db/doors.ts`, gives the Settings page, both scanner routes and the Overview one shared set of per-door tallies.
- The scanner's server actions gain a `not_booked` outcome and a `walkIn` override.

**Tech Stack:** Next.js 16 app router (server components + server actions), Supabase (service-role client), Tailwind + shadcn/Base UI, vitest.

**Spec:** `docs/superpowers/specs/2026-09-28-booking-door-check-in-design.md` (D324–D331). Read it first.

## Global Constraints

- **Next.js:** read `AGENTS.md`. This Next.js differs from training data. Use only APIs already used in this repo: `router.refresh()`, server actions, `revalidatePath`, `redirect`. If you reach for anything else, read `node_modules/next/dist/docs/` first.
- **Git:**
  - Work on `main`; the user declines worktrees.
  - Other sessions push to `main` too: `git pull --rebase` before each commit and push.
  - Never stage `docs/superpowers/specs/2026-09-27-intro-video-design.md`. It is someone else's uncommitted work.
  - Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Testing on real data:** never test on the event with slug `ecphub`, which is live. Use any other event.
- **Database access:** through the service-role client only. RLS on `checkpoints` has no policies.
- **Copy (exact strings):**
  - `"Not booked for this session"`
  - `"Let them in anyway"`
  - `"Mark arrived"`
  - `"No-show"`
  - `"Walk-in"`
  - `"Booked"` (the field label on the scan card)
  - `"{Activity} has no sessions on {Wed 30 Sep}."`
  - `"To track who turns up, add a checkpoint for this activity in Settings › Checkpoints."`
- **Time:** Malaysian time is always `nowInKL()` from `src/lib/time.ts` (`{ date: "YYYY-MM-DD", time: "HH:MM" }`). Session `starts_at` / `ends_at` are `"HH:MM"` strings (trimmed by `listSessions`).
- **Commands:**
  - Typecheck: `npx tsc --noEmit -p .`
  - Tests: `npx vitest run`
  - Lint the files you touched: `npx eslint <files>`

---

### Task 1: Door logic (pure)

**Files:**
- Modify: `src/lib/types.ts` (the `Checkpoint` type, line ~171)
- Modify: `tests/checkpoints.test.ts:5-6` (fixture gains `activity_id`)
- Create: `src/lib/booking-door.ts`
- Test: `tests/booking-door.test.ts`

**Interfaces:**
- Produces, used by Tasks 2–5:
  - `Checkpoint.activity_id: string | null`
  - `type Now = { date: string; time: string }`
  - `type SlotPhase = "now" | "next" | "later" | "earlier"`
  - `type BoardPerson = { id: string; name: string; arrivedAt: string | null; noShow: boolean }`
  - `type BoardSlot = { id: string; time: string; location: string | null; phase: SlotPhase; people: BoardPerson[]; arrived: number; noShows: number }`
  - `type WalkIn = { id: string; name: string; at: string }`
  - `type Board = { slots: BoardSlot[]; walkIns: WalkIn[]; arrived: number; expected: number }`
  - `type DoorTally = { arrived: number; expected: number; walkIns: number }`
  - `slotTime(s: Pick<ActivitySession, "starts_at" | "ends_at">): string`
  - `slotEnds(sessions: Pick<ActivitySession, "id" | "starts_at" | "ends_at">[]): Map<string, string | null>`
  - `doorSessions(cp: Pick<Checkpoint, "activity_id" | "day">, sessions: ActivitySession[]): ActivitySession[]`
  - `slotPhases(sessions: Pick<ActivitySession, "id" | "starts_at" | "ends_at">[], day: string, now: Now): Map<string, SlotPhase>`
  - `doorBoard(input: { day: string; sessions: ActivitySession[]; bookings: Pick<ActivityBooking, "session_id" | "attendee_id">[]; checkins: Pick<Checkin, "attendee_id" | "scanned_at">[]; names: ReadonlyMap<string, string>; now: Now }): Board`
  - `doorTallies(checkpoints: Pick<Checkpoint, "id" | "activity_id" | "day">[], checkins: Pick<Checkin, "checkpoint_id" | "attendee_id">[], sessions: ActivitySession[], bookings: Pick<ActivityBooking, "session_id" | "attendee_id">[], registered: number): Record<string, DoorTally>`
  - `boardsByDay(activityId: string, checkpoints: Pick<Checkpoint, "id" | "activity_id" | "day">[], checkins: Pick<Checkin, "checkpoint_id" | "attendee_id" | "scanned_at">[], sessions: ActivitySession[], bookings: Pick<ActivityBooking, "session_id" | "attendee_id">[], names: ReadonlyMap<string, string>, now: Now): Map<string, Board>`

- [ ] **Step 1: Add `activity_id` to `Checkpoint`.** In `src/lib/types.ts`, replace

```ts
export type Checkpoint = { id: string; event_id: string; name: string; day: string; sort_order: number };
```

with

```ts
export type Checkpoint = {
  id: string;
  event_id: string;
  name: string;
  day: string;
  sort_order: number;
  /** A booking door's activity (D324): who is expected is who booked it on `day`. Null is an ordinary door. */
  activity_id: string | null;
};
```

In `tests/checkpoints.test.ts`, change the fixture to

```ts
const cp = (id: string, name: string, day: string, sort_order = 0): Checkpoint =>
  ({ id, event_id: "e1", name, day, sort_order, activity_id: null });
```

- [ ] **Step 2: Write the failing tests** in `tests/booking-door.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { boardsByDay, doorBoard, doorSessions, doorTallies, slotEnds, slotPhases, slotTime } from "@/lib/booking-door";
import type { ActivitySession } from "@/lib/types";

const DAY = "2026-09-30";
const s = (id: string, starts_at: string, ends_at: string | null = null, extra: Partial<ActivitySession> = {}): ActivitySession =>
  ({ id, event_id: "e1", activity_id: "a1", day: DAY, starts_at, ends_at, location: null, capacity: 3, sort_order: 0, ...extra });
const b = (session_id: string, attendee_id: string) => ({ session_id, attendee_id });
const scan = (attendee_id: string, scanned_at: string, checkpoint_id = "d1") => ({ attendee_id, scanned_at, checkpoint_id });
const at = (time: string, date = DAY) => ({ date, time });
const names = new Map([["p1", "Aisyah"], ["p2", "Ben"], ["p3", "Chen"], ["w1", "Walker"]]);
const quarterHours = [s("s1", "10:00", "10:15"), s("s2", "10:15", "10:30"), s("s3", "10:30", "10:45")];
const phases = (sessions: ActivitySession[], now: { date: string; time: string }, day = DAY) =>
  Object.fromEntries(slotPhases(sessions, day, now));

describe("slotTime", () => {
  it("shows start and end", () => expect(slotTime({ starts_at: "10:30", ends_at: "10:45" })).toBe("10:30–10:45"));
  it("shows the start alone when there is no end", () => expect(slotTime({ starts_at: "10:30", ends_at: null })).toBe("10:30"));
});

describe("slotEnds (D330)", () => {
  it("uses a slot's own end", () => expect(slotEnds([s("s1", "10:00", "10:15")]).get("s1")).toBe("10:15"));
  it("without an end, a slot ends when the next one that day starts", () => {
    const ends = slotEnds([s("s1", "10:00"), s("s2", "10:30"), s("s3", "10:30")]);
    expect(ends.get("s1")).toBe("10:30");
  });
  it("the last slot with no end stays open", () => {
    expect(slotEnds([s("s1", "10:00"), s("s2", "10:30")]).get("s2")).toBeNull();
  });
});

describe("doorSessions", () => {
  const all = [s("s2", "11:00"), s("s1", "10:00"), s("x", "10:00", null, { activity_id: "a2" }), s("y", "10:00", null, { day: "2026-10-01" })];
  it("keeps the door's activity on the door's day, in time order", () => {
    expect(doorSessions({ activity_id: "a1", day: DAY }, all).map((x) => x.id)).toEqual(["s1", "s2"]);
  });
  it("is empty for an ordinary door", () => expect(doorSessions({ activity_id: null, day: DAY }, all)).toEqual([]));
});

describe("slotPhases", () => {
  it("before the first slot: the first is next, the rest later", () => {
    expect(phases(quarterHours, at("09:50"))).toEqual({ s1: "next", s2: "later", s3: "later" });
  });
  it("mid-slot: ended slots are earlier, the running one now, the following one next", () => {
    expect(phases(quarterHours, at("10:20"))).toEqual({ s1: "earlier", s2: "now", s3: "next" });
  });
  it("on a boundary the old slot has ended and the new one is running", () => {
    expect(phases(quarterHours, at("10:15"))).toEqual({ s1: "earlier", s2: "now", s3: "next" });
  });
  it("in a gap there is no now, only next", () => {
    expect(phases([s("s1", "10:00", "10:15"), s("s2", "11:00", "11:15")], at("10:30"))).toEqual({ s1: "earlier", s2: "next" });
  });
  it("after the last slot everything is earlier", () => {
    expect(phases(quarterHours, at("11:00"))).toEqual({ s1: "earlier", s2: "earlier", s3: "earlier" });
  });
  it("parallel slots share a phase", () => {
    const parallel = [s("s1", "10:00", "10:15"), s("s2", "10:00", "10:15")];
    expect(phases(parallel, at("09:00"))).toEqual({ s1: "next", s2: "next" });
    expect(phases(parallel, at("10:05"))).toEqual({ s1: "now", s2: "now" });
  });
  it("a slot with no end runs until the next starts; the last runs all day", () => {
    const open = [s("s1", "10:00"), s("s2", "10:30")];
    expect(phases(open, at("10:20"))).toEqual({ s1: "now", s2: "next" });
    expect(phases(open, at("23:00"))).toEqual({ s1: "earlier", s2: "now" });
  });
  it("a door dated before today is all earlier; after today all later", () => {
    expect(phases(quarterHours, at("10:20", "2026-10-01"))).toEqual({ s1: "earlier", s2: "earlier", s3: "earlier" });
    expect(phases(quarterHours, at("10:20", "2026-09-29"))).toEqual({ s1: "later", s2: "later", s3: "later" });
  });
});

describe("doorBoard", () => {
  const board = doorBoard({
    day: DAY,
    sessions: quarterHours,
    bookings: [b("s1", "p2"), b("s1", "p1"), b("s2", "p3"), b("other", "p9")],
    checkins: [scan("p1", "2026-09-30T02:02:00+00:00"), scan("w1", "2026-09-30T02:05:00+00:00")],
    names,
    now: at("10:20"),
  });

  it("lists each slot's bookers by name with their phase and time", () => {
    expect(board.slots.map((x) => [x.id, x.time, x.phase, x.people.map((p) => p.name)])).toEqual([
      ["s1", "10:00–10:15", "earlier", ["Aisyah", "Ben"]],
      ["s2", "10:15–10:30", "now", ["Chen"]],
      ["s3", "10:30–10:45", "next", []],
    ]);
  });
  it("a booker with no arrival in an ended slot is a no-show; in a running slot they are not", () => {
    const [s1, s2] = board.slots;
    expect(s1.people.map((p) => [p.name, p.arrivedAt, p.noShow])).toEqual([
      ["Aisyah", "2026-09-30T02:02:00+00:00", false],
      ["Ben", null, true],
    ]);
    expect(s1.arrived).toBe(1);
    expect(s1.noShows).toBe(1);
    expect(s2.people[0].noShow).toBe(false);
  });
  it("counts booked arrivals over bookers and keeps walk-ins apart (D331)", () => {
    expect(board.arrived).toBe(1);
    expect(board.expected).toBe(3);
    expect(board.walkIns).toEqual([{ id: "w1", name: "Walker", at: "2026-09-30T02:05:00+00:00" }]);
  });
  it("takes the earliest arrival and names an unknown attendee", () => {
    const b2 = doorBoard({
      day: DAY, sessions: [s("s1", "10:00", "10:15")], bookings: [b("s1", "zz")],
      checkins: [scan("zz", "2026-09-30T02:09:00+00:00"), scan("zz", "2026-09-30T02:01:00+00:00")],
      names, now: at("10:05"),
    });
    expect(b2.slots[0].people).toEqual([{ id: "zz", name: "Unknown", arrivedAt: "2026-09-30T02:01:00+00:00", noShow: false }]);
  });
});

describe("doorTallies", () => {
  const sessions = [s("s1", "10:00", "10:15"), s("s9", "10:00", "10:15", { day: "2026-10-01" })];
  const bookings = [b("s1", "p1"), b("s1", "p2"), b("s9", "p3")];
  const checkins = [
    { checkpoint_id: "reg", attendee_id: "p1" }, { checkpoint_id: "reg", attendee_id: "p3" },
    { checkpoint_id: "d1", attendee_id: "p1" }, { checkpoint_id: "d1", attendee_id: "w1" },
  ];
  const doors = [{ id: "reg", activity_id: null, day: DAY }, { id: "d1", activity_id: "a1", day: DAY }, { id: "empty", activity_id: "a1", day: "2026-10-02" }];
  const t = doorTallies(doors, checkins, sessions, bookings, 120);

  it("an ordinary door counts every check-in against everyone registered", () => {
    expect(t.reg).toEqual({ arrived: 2, expected: 120, walkIns: 0 });
  });
  it("a booking door counts that day's bookers only, with walk-ins apart", () => {
    expect(t.d1).toEqual({ arrived: 1, expected: 2, walkIns: 1 });
  });
  it("a booking door on a day without sessions expects nobody", () => {
    expect(t.empty).toEqual({ arrived: 0, expected: 0, walkIns: 0 });
  });
});

describe("boardsByDay", () => {
  it("builds a board only for days with a door, and merges two doors on one day", () => {
    const sessions = [s("s1", "10:00", "10:15"), s("s9", "10:00", "10:15", { day: "2026-10-01" })];
    const boards = boardsByDay(
      "a1",
      [{ id: "d1", activity_id: "a1", day: DAY }, { id: "d2", activity_id: "a1", day: DAY }, { id: "reg", activity_id: null, day: DAY }],
      [
        { checkpoint_id: "d1", attendee_id: "p1", scanned_at: "2026-09-30T02:02:00+00:00" },
        { checkpoint_id: "d2", attendee_id: "p2", scanned_at: "2026-09-30T02:03:00+00:00" },
        { checkpoint_id: "reg", attendee_id: "p3", scanned_at: "2026-09-30T01:00:00+00:00" },
      ],
      sessions,
      [b("s1", "p1"), b("s1", "p2"), b("s9", "p3")],
      names,
      at("12:00"),
    );
    expect([...boards.keys()]).toEqual([DAY]);
    expect(boards.get(DAY)!.arrived).toBe(2);
    expect(boards.get(DAY)!.walkIns).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail.** Run `npx vitest run tests/booking-door.test.ts`. Expected: FAIL, cannot resolve `@/lib/booking-door`.

- [ ] **Step 4: Implement `src/lib/booking-door.ts`:**

```ts
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
    const ids = new Set(sessions.filter((s) => s.activity_id === cp.activity_id && s.day === cp.day).map((s) => s.id));
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
```

- [ ] **Step 5: Run the tests.** Run `npx vitest run tests/booking-door.test.ts tests/checkpoints.test.ts`. Expected: all PASS.

- [ ] **Step 6: Typecheck.** Run `npx tsc --noEmit -p .`. Expected: the only errors are object literals typed `Checkpoint` that now miss `activity_id`. Fix each by adding `activity_id: null`; there should be none outside tests. Re-run until there are no errors.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/types.ts src/lib/booking-door.ts tests/booking-door.test.ts tests/checkpoints.test.ts
git commit -m "feat(check-in): booking door logic — slots, arrivals, no-shows, walk-ins (D324-D331)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The column, creating a booking door, and Settings

**Files:**
- Create: `supabase/migrations/0052_booking_door.sql`
- Create: `src/lib/db/doors.ts`
- Modify: `src/lib/db/checkpoints.ts` (`createCheckpoint`)
- Modify: `src/app/admin/events/[id]/actions.ts` (`addCheckpointAction` ~line 758, and its imports)
- Modify: `src/app/admin/events/[id]/settings/page.tsx` (loading ~line 84; the checkpoint modal ~line 154; the `CheckpointList` props ~line 176)
- Modify: `src/components/admin/CheckpointList.tsx`

**Interfaces:**
- Consumes, from Task 1: `doorTallies`, `DoorTally`, `Checkpoint.activity_id`.
- Produces:
  - `createCheckpoint(event, name: string, day: string, activityId: string | null = null)`
  - `type LoadedDoors = { cps: Checkpoint[]; checkins: Checkin[]; sessions: ActivitySession[]; bookings: ActivityBooking[]; registered: number; tallies: Record<string, DoorTally> }`
  - `loadDoors(eventId: string): Promise<LoadedDoors>`, in `src/lib/db/doors.ts`
  - `CheckpointList` props `tallies: Record<string, DoorTally>` and `activityNames: Record<string, string>`, replacing `counts` and `total`.

- [ ] **Step 1: Write the migration** `supabase/migrations/0052_booking_door.sql`:

```sql
-- Booking doors (D324): a checkpoint can stand for one booking activity on its day. Null is an
-- ordinary door, where everyone registered is expected. Deleting the activity keeps the door
-- and its check-ins as an ordinary one (D329); deleting the door still takes its check-ins.
alter table checkpoints
  add column activity_id uuid references activities(id) on delete set null;
create index checkpoints_activity_id_idx on checkpoints (activity_id);
```

- [ ] **Step 2: Apply it.** Use the Supabase MCP `apply_migration` on project `wfmqwwcolfigjylkgrsv`, name `booking_door`, with the SQL above. It is additive and nullable, so the live event is unaffected. Then verify with `execute_sql`:

```sql
select column_name, is_nullable from information_schema.columns where table_name = 'checkpoints' and column_name = 'activity_id';
```

Expected: one row, `is_nullable = YES`.

- [ ] **Step 3: Store the activity on create.** In `src/lib/db/checkpoints.ts`, change `createCheckpoint`:

```ts
/** Appends to the end of its day: a new checkpoint is the next thing that happens, not the first. `activityId` makes it a booking door (D324). */
export async function createCheckpoint(event: Pick<Event, "id" | "org_id">, name: string, day: string, activityId: string | null = null) {
  const db = serviceClient();
  const { data: last } = await db.from("checkpoints").select("sort_order")
    .eq("event_id", event.id).eq("day", day).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;
  const { error } = await db.from("checkpoints").insert({ org_id: event.org_id, event_id: event.id, name, day, sort_order, activity_id: activityId });
  if (error) throw error;
}
```

- [ ] **Step 4: Create the shared loader** `src/lib/db/doors.ts`:

```ts
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
```

- [ ] **Step 5: Validate and save in `addCheckpointAction`.** In `src/app/admin/events/[id]/actions.ts`:
  - Change the import on line 27 to `import { listActivities, listBookings, listSessions } from "@/lib/db/activities";`.
  - `shortDate` is already imported on line 44.
  - Replace `addCheckpointAction` with:

```ts
export async function addCheckpointAction(eventId: string, formData: FormData) {
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(eventId, orgId);
  const activityId = str(formData, "activity_id");
  const day = str(formData, "day");
  const back = `/admin/events/${eventId}/settings`;
  // A booking door (D324) names one of this event's booking activities. Checked here, not
  // trusted from the form: a posted id from another event or kind must not become a door.
  const activity = activityId ? (await listActivities(ev.id, "booking")).find((a) => a.id === activityId) ?? null : null;
  if (activityId && !activity) redirect(flashPath(back, "That activity no longer exists.", "error"));
  // A booking door may leave the name blank; it takes the activity's.
  const name = str(formData, "name") || activity?.name || "";
  if (!name) redirect(flashPath(back, "A checkpoint needs a name.", "error"));
  // A checkpoint names a moment on a date, so the date is not optional — several
  // checkpoints can share one day and the filters need to tell them apart.
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) redirect(flashPath(back, "Pick a date for the checkpoint.", "error"));
  // A booking door on a day with no sessions would expect nobody and could only record walk-ins.
  if (activity && !(await listSessions(ev.id)).some((s) => s.activity_id === activity.id && s.day === day)) {
    redirect(flashPath(back, `${activity.name} has no sessions on ${shortDate(day)}.`, "error"));
  }
  await createCheckpoint(ev, name, day, activity?.id ?? null);
  revalidatePath(back);
  revalidatePath(`/admin/events/${eventId}`);
  redirect(flashPath(back, `“${name}” added.`));
}
```

  Check the `str` helper at line 46. If it returns `string | null` rather than `""`, the `||` chain above still works. Keep `name` a `string`.

- [ ] **Step 6: Settings loads the doors and the booking activities.** In `src/app/admin/events/[id]/settings/page.tsx`:
  - **Imports:**
    - Remove `listCheckpoints`, `countCheckinsByCheckpoint` and `countAttendees`.
    - Add `import { loadDoors } from "@/lib/db/doors";` and `import { listActivities } from "@/lib/db/activities";`.
  - **Loading:** replace the `Promise.all` at line 84 with

```ts
  const [{ cps, tallies, registered: total }, jar, bookingActivities] = await Promise.all([
    loadDoors(ev.id), cookies(), listActivities(ev.id, "booking"),
  ]);
  const activityNames = Object.fromEntries(bookingActivities.map((a) => [a.id, a.name]));
```

  (`total` is still used by the delete warning at line ~393.)
  - **The modal form (line ~155):** replace its contents with

```tsx
            <form action={addCheckpointAction.bind(null, ev.id)} className="grid gap-4 sm:grid-cols-2">
              {bookingActivities.length > 0 && (
                <div className="grid gap-2 sm:col-span-2">
                  <label className="text-sm font-medium" htmlFor="cp_activity">Who&apos;s expected</label>
                  <select id="cp_activity" name="activity_id" className={input} defaultValue="">
                    <option value="">Everyone registered</option>
                    {bookingActivities.map((a) => <option key={a.id} value={a.id}>Booked for {a.name}</option>)}
                  </select>
                  <p className="text-xs text-muted-foreground">A booking door lists who booked that day&apos;s sessions, and shows who didn&apos;t come.</p>
                </div>
              )}
              <Field label="Name" name="name" placeholder="Registration"
                description={bookingActivities.length > 0 ? "For a booking door, leave blank to use the activity's name." : undefined} />
              <Field label="Date" name="day" type="date" defaultValue={days[0] ?? ev.starts_on} />
              <div className="sm:col-span-2"><SubmitButton>Add checkpoint</SubmitButton></div>
            </form>
```

  - **`CheckpointList`:** replace `counts={cpCounts}` and `total={total}` with `tallies={tallies}` and `activityNames={activityNames}`.

- [ ] **Step 7: Booking doors in the list.** In `src/components/admin/CheckpointList.tsx`:
  - Add `import type { DoorTally } from "@/lib/booking-door";`.
  - In the props type, replace `counts: Record<string, number>; total: number;` with

```ts
  /** Each door's "n of m" (D331). */
  tallies: Record<string, DoorTally>;
  /** Booking activity names by id, for a booking door's badge. */
  activityNames: Record<string, string>;
```

  and destructure `tallies, activityNames` in place of `counts, total`.
  - In the row, replace `const n = counts[c.id] ?? 0;` with

```ts
          const t = tallies[c.id] ?? { arrived: 0, expected: 0, walkIns: 0 };
          const n = t.arrived + t.walkIns; // every check-in the door holds, for the delete warning
          const walkIns = t.walkIns ? ` · ${t.walkIns} walk-in${t.walkIns === 1 ? "" : "s"}` : "";
```

  - Replace the name row and count line with

```tsx
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">{c.name}</span>
                  {c.activity_id && <Badge variant="secondary">Booked for {activityNames[c.activity_id] ?? "an activity"}</Badge>}
                  {c.id === activeId && <Badge variant="success">Running now</Badge>}
                </div>
                <div className="text-xs font-semibold text-muted-foreground tabular-nums">
                  {c.activity_id ? `${t.arrived} of ${t.expected} booked in${walkIns}` : `${t.arrived} of ${t.expected} checked in`}
                </div>
```

- [ ] **Step 8: Typecheck, lint, test.** Run:
  - `npx tsc --noEmit -p .`
  - `npx eslint src/lib/db/doors.ts src/lib/db/checkpoints.ts "src/app/admin/events/[id]/actions.ts" "src/app/admin/events/[id]/settings/page.tsx" src/components/admin/CheckpointList.tsx`
  - `npx vitest run`

  Expected: clean, all PASS.

- [ ] **Step 9: Check it in the browser.**
  - `preview_start` `{ name: "dev" }`.
  - On a **non-ecphub** event with check-in on, open Settings › Checkpoints and click "New checkpoint".
    - With no booking activity the select is absent.
    - With one, it lists "Booked for …".
  - Create a booking door with a blank name on a day that has sessions. It is named after the activity and shows the "Booked for …" badge and "0 of N booked in".
  - Try a day without sessions. The flash reads "X has no sessions on Wed 30 Sep." and nothing is created.
  - The test data for this step is set up in Task 5 Step 1. If you run Task 2 first, do that setup now.

- [ ] **Step 10: Commit.**

```bash
git add supabase/migrations/0052_booking_door.sql src/lib/db/doors.ts src/lib/db/checkpoints.ts "src/app/admin/events/[id]/actions.ts" "src/app/admin/events/[id]/settings/page.tsx" src/components/admin/CheckpointList.tsx
git commit -m "feat(check-in): a checkpoint can be a booking door, set up in Settings (D324, D329)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Scanning at a booking door — warn, then allow

**Files:**
- Modify: `src/lib/db/activities.ts` (add two readers after `bookingsForAttendee`, ~line 190)
- Modify: `src/lib/db/checkins.ts` (add `getCheckin`)
- Modify: `src/app/scan/[eventId]/actions.ts`
- Modify: `src/app/scan/[eventId]/Scanner.tsx` (outcome maps, the result card, search hit badges)

**Interfaces:**
- Consumes, from Task 1: `slotTime`, `Checkpoint.activity_id`.
- Produces:
  - `bookedSessionOn(attendeeId: string, activityId: string, day: string): Promise<ActivitySession | null>`
  - `bookerIdsOn(activityId: string, day: string): Promise<Set<string>>`
  - `getCheckin(checkpointId: string, attendeeId: string): Promise<Checkin | null>`
  - `ScanResult["status"]` gains `"not_booked"`.
  - `SearchHit.booked: boolean | null`, where null means an ordinary door.
  - `checkInByIdAction(eventId, checkpointId, attendeeId, crewToken?: string, walkIn = false)`

- [ ] **Step 1: Readers.** Append to `src/lib/db/activities.ts`, after `bookingsForAttendee`:

```ts
/**
 * The session one attendee booked of an activity on one day, or null (D326). Two small
 * queries - their bookings of the activity, then which of those sessions fall on the day - so
 * a scan never reads the event's whole booking table.
 */
export async function bookedSessionOn(attendeeId: string, activityId: string, day: string): Promise<ActivitySession | null> {
  const db = serviceClient();
  const { data: rows, error } = await db.from("activity_bookings").select("session_id")
    .eq("attendee_id", attendeeId).eq("activity_id", activityId);
  if (error) throw error;
  const ids = (rows ?? []).map((r) => r.session_id as string);
  if (ids.length === 0) return null;
  const { data, error: e2 } = await db.from("activity_sessions").select("*")
    .in("id", ids).eq("day", day).order("starts_at").limit(1).maybeSingle();
  if (e2) throw e2;
  if (!data) return null;
  const s = data as ActivitySession;
  return { ...s, starts_at: s.starts_at.slice(0, 5), ends_at: s.ends_at?.slice(0, 5) ?? null };
}

/** Everyone booked into an activity on one day: who a booking door expects (D324). */
export async function bookerIdsOn(activityId: string, day: string): Promise<Set<string>> {
  const db = serviceClient();
  const { data: sessions, error } = await db.from("activity_sessions").select("id")
    .eq("activity_id", activityId).eq("day", day);
  if (error) throw error;
  const ids = (sessions ?? []).map((s) => s.id as string);
  if (ids.length === 0) return new Set();
  const { data, error: e2 } = await db.from("activity_bookings").select("attendee_id").in("session_id", ids);
  if (e2) throw e2;
  return new Set((data ?? []).map((r) => r.attendee_id as string));
}
```

  Append to `src/lib/db/checkins.ts`:

```ts
/** One attendee's check-in at one door, or null. */
export async function getCheckin(checkpointId: string, attendeeId: string): Promise<Checkin | null> {
  const { data, error } = await serviceClient().from("checkins").select("*")
    .eq("checkpoint_id", checkpointId).eq("attendee_id", attendeeId).maybeSingle();
  if (error) throw error;
  return data as Checkin | null;
}
```

- [ ] **Step 2: The actions.** In `src/app/scan/[eventId]/actions.ts`:
  - **Imports:**
    - Change the checkins import to `import { recordCheckin, listCheckedInAttendeeIds, deleteCheckin, getCheckin } from "@/lib/db/checkins";`.
    - Add `import { bookedSessionOn, bookerIdsOn } from "@/lib/db/activities";` and `import { slotTime } from "@/lib/booking-door";`.
  - **Types:** replace `ScanResult` and `SearchHit` with

```ts
export type ScanResult = {
  status: "ok" | "duplicate" | "notfound" | "error" | "undone" | "not_booked";
  attendee?: Attendee; fields?: { label: string; value: string }[]; earlier?: { at: string }; message?: string;
};

/** `booked` is null at an ordinary door, where there is nothing to have booked. */
export type SearchHit = Pick<Attendee, "id" | "name" | "category"> & { table_no: string | null; checkedIn: boolean; booked: boolean | null };
```

  - **`doCheckin`:** replace it with

```ts
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
  return r.created ? { status: "ok", attendee, fields } : { status: "duplicate", attendee, fields, earlier: { at: r.existing!.scanned_at } };
}
```

  - **`checkInByIdAction`:** give it a `walkIn` parameter:

```ts
/** `walkIn` is the crew's "Let them in anyway" after a `not_booked` answer (D326). */
export async function checkInByIdAction(eventId: string, checkpointId: string, attendeeId: string, crewToken?: string, walkIn = false): Promise<ScanResult> {
  const auth = await authorise(eventId, crewToken);
  if ("error" in auth) return { status: "error", message: auth.error };
  const { ev, userId } = auth;
  const a = await getAttendee(attendeeId);
  if (!a || a.event_id !== eventId) return { status: "notfound", message: "That attendee is no longer on the list." };
  return doCheckin(ev, userId, checkpointId, a, walkIn);
}
```

  - **`searchAttendeesAction`:** replace the lines from `const [rows, checkedIn] = …` through the `return` with

```ts
  const checkpoint = await getCheckpoint(checkpointId, ev.id);
  const [rows, checkedIn, bookers] = await Promise.all([
    listAttendees(eventId, q),
    listCheckedInAttendeeIds(checkpointId),
    checkpoint?.activity_id ? bookerIdsOn(checkpoint.activity_id, checkpoint.day) : Promise.resolve(null),
  ]);
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
```

- [ ] **Step 3: The result card.** In `src/app/scan/[eventId]/Scanner.tsx`:
  - Add `LogIn` to the lucide import.
  - Add a `not_booked` entry to each outcome map:
    - `TONE`: `not_booked: "bg-warning-soft text-warning",`
    - `BAND`: `not_booked: "bg-warning text-white",`
    - `ICON`: `not_booked: CircleAlert,`
    - `DOT`: `not_booked: "bg-warning",`
    - `LABEL`: `not_booked: "Not booked for this session",`

    These reuse the warning pairs `tests/contrast.test.ts` already asserts.
  - Below `LABEL`, add

```ts
/** How the recent list words each outcome. */
const RECENT: Record<Recent["status"], string> = {
  ok: "in", duplicate: "already in", undone: "undone", not_booked: "not booked", notfound: "", error: "",
};
```

    In the recent list's time span, replace `{r.status === "undone" ? "undone" : r.status === "duplicate" ? "already in" : "in"}` with `{RECENT[r.status]}`.
  - In the result card, directly after the existing Undo `Button` block and inside the same `div`, add

```tsx
            {result.status === "not_booked" && (
              // D326: nothing was recorded. Letting them in is one deliberate tap, and it records
              // an ordinary check-in that the door then lists as a walk-in.
              <Button type="button" disabled={busy}
                className={cn("mt-auto w-fit font-bold", hero ? "h-12 px-5 text-base" : "h-11 px-4")}
                onClick={() => handle(() => checkInByIdAction(eventId, checkpoint.id, result.attendee!.id, crewToken, true))}>
                <LogIn data-icon="inline-start" />
                Let them in anyway
              </Button>
            )}
```

  - In the search hits, replace the badge expression with

```tsx
                    {h.checkedIn ? <Badge variant="success">Already in</Badge>
                      : h.booked === false ? <Badge variant="warning">Not booked</Badge>
                      : <Badge>Check in</Badge>}
```

- [ ] **Step 4: Typecheck, lint, test.** Run:
  - `npx tsc --noEmit -p .`
  - `npx eslint "src/app/scan/[eventId]/actions.ts" "src/app/scan/[eventId]/Scanner.tsx" src/lib/db/activities.ts src/lib/db/checkins.ts`
  - `npx vitest run`

  Expected: clean, PASS.

- [ ] **Step 5: Check it in the browser** at the booking door from Task 2 (`/scan/<testEventId>?cp=<doorId>`), using name search:
  - A booker gives green "Checked in" with "Booked 10:30–10:45" first.
  - A non-booker's hit shows "Not booked". Tapping it gives the amber "Not booked for this session" card, with nothing recorded.
  - "Let them in anyway" then gives green "Checked in" with "Booked: Walk-in".
  - Searching them again shows "Already in"; tapping gives amber "Already in" with "Booked: Walk-in".
  - An ordinary door behaves exactly as before, with no "Booked" field.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/db/activities.ts src/lib/db/checkins.ts "src/app/scan/[eventId]/actions.ts" "src/app/scan/[eventId]/Scanner.tsx"
git commit -m "feat(check-in): booking doors warn before letting in someone who didn't book (D326)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The expected list, the counts, and staying current

**Files:**
- Modify: `src/lib/db/doors.ts` (add `loadBoard`)
- Create: `src/app/scan/[eventId]/ExpectedList.tsx`
- Modify: `src/app/scan/[eventId]/Scanner.tsx` (props, header count, refresh, list swap)
- Modify: `src/app/scan/[eventId]/page.tsx`
- Modify: `src/app/crew/[token]/page.tsx`

**Interfaces:**
- Consumes:
  - From Task 1: `doorBoard`, `doorSessions`, `Board`, `BoardSlot`, `Now`.
  - From Task 2: `loadDoors`, `LoadedDoors`.
  - From Task 3: `checkInByIdAction`.
- Produces:
  - `loadBoard(eventId: string, cp: Checkpoint, doors: LoadedDoors, now: Now): Promise<Board | null>`
  - `Scanner` prop `board?: Board`
  - `ExpectedList({ board, busy, onMark, live })`

- [ ] **Step 1: `loadBoard`.** Append to `src/lib/db/doors.ts`, and add `listAttendeesByIds` to the attendees import, `doorBoard, doorSessions, type Board, type Now` to the booking-door import:

```ts
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
```

- [ ] **Step 2: The list.** Create `src/app/scan/[eventId]/ExpectedList.tsx`:

```tsx
import type { ReactNode } from "react";
import type { Board, BoardSlot } from "@/lib/booking-door";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { shortTime } from "@/lib/text";
import { cn } from "@/lib/utils";

const PHASE_LABEL: Record<BoardSlot["phase"], string | null> = { now: "Now", next: "Next", later: null, earlier: null };

/**
 * Who a booking door is waiting for (D324), in slot order. The slot running now and the next
 * one stay open; later and ended slots fold away so the list a thumb works stays short.
 * Ended slots name their no-shows but keep "Mark arrived": late arrivals happen.
 */
export function ExpectedList({ board, busy, onMark, live }: {
  board: Board;
  busy: boolean;
  onMark: (attendeeId: string) => void;
  /** The auto-refresh pill: this list is shared by every phone on the door. */
  live: ReactNode;
}) {
  const open = board.slots.filter((s) => s.phase === "now" || s.phase === "next");
  // A door dated another day has no now or next: show every slot open, in order.
  const shownOpen = open.length > 0 ? open : board.slots;
  const later = open.length > 0 ? board.slots.filter((s) => s.phase === "later") : [];
  const earlier = open.length > 0 ? board.slots.filter((s) => s.phase === "earlier") : [];
  const earlierNoShows = earlier.reduce((n, s) => n + s.noShows, 0);

  const slot = (s: BoardSlot) => (
    <div key={s.id} className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border bg-muted px-3.5 py-2 text-xs font-bold">
        {PHASE_LABEL[s.phase] && <Badge variant={s.phase === "now" ? "success" : "secondary"}>{PHASE_LABEL[s.phase]}</Badge>}
        <span className="tabular-nums">{s.time}</span>
        {s.location && <span className="font-semibold text-muted-foreground">{s.location}</span>}
        <span className="ml-auto tabular-nums text-muted-foreground">
          {s.arrived} of {s.people.length}{s.noShows ? ` · ${s.noShows} no-show` : ""}
        </span>
      </div>
      {s.people.length === 0 ? (
        <p className="px-3.5 py-2.5 text-sm text-muted-foreground">Nobody booked</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {s.people.map((p) => (
            <li key={p.id} className="flex min-h-12 items-center gap-3 px-3.5 py-1.5">
              <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", p.arrivedAt ? "bg-success-strong" : "border-2 border-border")} />
              <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
              {p.arrivedAt ? (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">arrived {shortTime(p.arrivedAt)}</span>
              ) : (
                <>
                  {p.noShow && <Badge className="shrink-0 bg-destructive-soft text-destructive-strong">No-show</Badge>}
                  <Button type="button" size="sm" variant="outline" disabled={busy} className="h-9 shrink-0" onClick={() => onMark(p.id)}>
                    Mark arrived
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <section className="mt-2 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-muted-foreground">Expected</h2>
        {live}
      </div>
      {board.slots.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-3.5 py-3 text-sm text-muted-foreground">No sessions on this day any more.</p>
      )}
      {shownOpen.map(slot)}
      {later.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer py-1.5 text-sm font-bold text-muted-foreground">Later · {later.length} slot{later.length === 1 ? "" : "s"}</summary>
          <div className="mt-2 flex flex-col gap-2">{later.map(slot)}</div>
        </details>
      )}
      {earlier.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer py-1.5 text-sm font-bold text-muted-foreground">
            Earlier · {earlier.length} slot{earlier.length === 1 ? "" : "s"}{earlierNoShows ? ` · ${earlierNoShows} no-show` : ""}
          </summary>
          <div className="mt-2 flex flex-col gap-2">{earlier.map(slot)}</div>
        </details>
      )}
      {board.walkIns.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border bg-muted px-3.5 py-2 text-xs font-bold">Walk-ins · {board.walkIns.length}</div>
          <ul className="divide-y divide-border text-sm">
            {board.walkIns.map((w) => (
              <li key={w.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-warning" />
                <span className="min-w-0 flex-1 truncate font-semibold">{w.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{shortTime(w.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Wire it into `Scanner`.** In `src/app/scan/[eventId]/Scanner.tsx`:
  - **Imports:** add `import { useRouter } from "next/navigation";`, `import type { Board } from "@/lib/booking-door";`, `import { ExpectedList } from "./ExpectedList";` and `import { AutoRefresh } from "@/components/admin/AutoRefresh";`.
  - **Signature:** add the `board` prop:

```tsx
export function Scanner({ eventId, checkpoint, initialCount, total, crewToken, board }: { eventId: string; checkpoint: Checkpoint; initialCount: number; total: number; crewToken?: string; board?: Board }) {
```

  - **After the existing `useState` lines**, add

```tsx
  const router = useRouter();
  // A booking door's list is shared by every phone at the door, so it comes from the server:
  // a refresh after each of this phone's own scans, and AutoRefresh for everyone else's.
  const bookingDoor = board !== undefined;
```

  - **In `handle`**, after `setResult(r);`, add `if (bookingDoor && r.status !== "error") router.refresh();`. Change `handle`'s dependency array from `[]` to `[bookingDoor, router]`. Both are stable for the life of the component, so the camera does not restart.
  - **Header count:** before `const named = …`, add

```tsx
  // At a booking door the count is booked arrivals over bookers (D331), read from the server's
  // board so every phone agrees. An ordinary door keeps counting its own scans.
  const shown = board ? board.arrived : count;
  const of = board ? board.expected : total;
  const walkIns = board?.walkIns.length ?? 0;
```

    Then:
    - In the sr-only line, the count `<span>`, the `Progress` (`value`, `aria-label`, `aria-valuenow`, `aria-valuemax`), replace `count` with `shown` and `total` with `of`.
    - Inside the count `<p>`, after the "of … in" span, add

```tsx
          {walkIns > 0 && <span className="text-xs font-semibold text-warning">+{walkIns} walk-in{walkIns === 1 ? "" : "s"}</span>}
```

  - **The list swap:** replace the `{recent.length > 0 && ( … )}` section with

```tsx
          {board ? (
            <ExpectedList board={board} busy={busy} live={<AutoRefresh seconds={15} />}
              onMark={(id) => handle(() => checkInByIdAction(eventId, checkpoint.id, id, crewToken))} />
          ) : recent.length > 0 && (
            <section className="mt-2 flex flex-col gap-2">
              {/* …the existing Recent section, unchanged… */}
            </section>
          )}
```

    Keep the existing Recent `<section>` markup verbatim inside the second branch.

- [ ] **Step 4: Both pages load doors and the board.**
  - **In `src/app/scan/[eventId]/page.tsx`:**
    - Replace the imports of `listCheckpoints`, `countCheckinsByCheckpoint` and `countAttendees` with `import { loadBoard, loadDoors } from "@/lib/db/doors";`.
    - Replace `const [cps, counts, total] = await Promise.all([...]);` with

```ts
  const doors = await loadDoors(ev.id);
  const { cps, tallies } = doors;
```

    - In the door list, change the badge to `{tallies[c.id]?.arrived ?? 0}/{tallies[c.id]?.expected ?? doors.registered}`.
    - Change the final return to

```tsx
  const tally = tallies[active.id] ?? { arrived: 0, expected: doors.registered, walkIns: 0 };
  const board = await loadBoard(ev.id, active, doors, nowInKL());
  return <Scanner eventId={ev.id} checkpoint={active} initialCount={tally.arrived} total={tally.expected} board={board ?? undefined} />;
```

  - **In `src/app/crew/[token]/page.tsx`:** make the same three changes (imports, loading, badge). Its return becomes

```tsx
  const tally = tallies[active.id] ?? { arrived: 0, expected: doors.registered, walkIns: 0 };
  const board = await loadBoard(ev.id, active, doors, nowInKL());
  return <Scanner eventId={ev.id} checkpoint={active} initialCount={tally.arrived} total={tally.expected} crewToken={token} board={board ?? undefined} />;
```

- [ ] **Step 5: Typecheck, lint, test.** Run:
  - `npx tsc --noEmit -p .`
  - `npx eslint "src/app/scan/[eventId]" "src/app/crew/[token]/page.tsx" src/lib/db/doors.ts`
  - `npx vitest run`

  Expected: clean, PASS.

- [ ] **Step 6: Check it in the browser** at the test booking door:
  - Header and list:
    - The header reads "n of m in", plus "+1 walk-in" after Task 3's walk-in.
    - The Expected list shows Now / Next open and Later / Earlier folded, with arrival times, "Mark arrived" buttons and the Walk-ins block.
  - Marking and undoing:
    - "Mark arrived" gives green "Checked in"; the row flips to "arrived hh:mm" and the count rises within about a second.
    - Undo reverses both.
  - A second tab on the same door picks up the change within 15 s.
  - The crew link (`/crew/<token>?cp=<doorId>`) shows the same.
  - An ordinary door still shows "Recent" and counts as before.
  - Check the console for errors (`read_console_messages`).
  - Check mobile width (`resize_window` preset `mobile`), then reset to `desktop`.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/db/doors.ts "src/app/scan/[eventId]/ExpectedList.tsx" "src/app/scan/[eventId]/Scanner.tsx" "src/app/scan/[eventId]/page.tsx" "src/app/crew/[token]/page.tsx"
git commit -m "feat(check-in): booking door scanner lists who's expected, arrivals and no-shows (D325, D330, D331)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Overview and the activity's Bookings tab, then a full pass

**Files:**
- Modify: `src/app/admin/events/[id]/page.tsx` (the check-in branch, from ~line 59)
- Modify: `src/components/admin/OverviewStats.tsx`
- Modify: `src/app/admin/events/[id]/activities/[activityId]/page.tsx` (`BookingDetail`)
- Modify: `src/components/admin/BookingsByDay.tsx`

**Interfaces:**
- Consumes:
  - From Task 1: `boardsByDay`.
  - From Task 2: `loadDoors`.
  - `listCheckpoints` and `listCheckinsForEvent` (existing).
- Produces:
  - `OverviewStats` prop `booking?: boolean`.
  - In `BookingsByDay`, `Row.people` becomes `{ name: string; mark: "arrived" | "no-show" | null }[]`, plus `Row.came: number | null` and `days[].walkIns: string[]`.

- [ ] **Step 1: Test data (skip if Task 2 Step 9 already made it).**
  - Pick a non-ecphub event with check-in on. Via `execute_sql`, list events with `select id, slug, check_in_enabled from events where slug <> 'ecphub';`.
  - In the admin, create a booking activity with 4 fifteen-minute sessions **today**. Put one of them ending before the current Malaysian time.
  - Place 4–5 attendees across the sessions, using its Not booked tab › place.
  - Create a booking door for it today in Settings.

- [ ] **Step 2: Overview.**
  - **In `src/components/admin/OverviewStats.tsx`:**
    - Add `booking = false` to the props, with the type comment `/** The running checkpoint is a booking door: the numbers are its bookers, not the event (D331). */ booking?: boolean;`.
    - In the "Not yet in" card, change the empty-state text to `{notYet === 0 ? (booking ? "Everyone booked has arrived." : "Everyone registered has arrived.") : "Expected but not scanned at this checkpoint."}`.
    - In the third card, change the `CardDescription` to `{booking ? "Booked" : "Registered"}`.
    - Change its footnote to `{booking ? "Booked into this activity on this checkpoint's day." : "On the list, across every checkpoint."}`.
  - **In `src/app/admin/events/[id]/page.tsx`, check-in branch:**
    - Replace `const [total, cps, checkins, attendees] = await Promise.all([countAttendees(ev.id), listCheckpoints(ev.id), listCheckinsForEvent(ev.id), listAttendees(ev.id)]);` with

```ts
  const [doors, attendees] = await Promise.all([loadDoors(ev.id), listAttendees(ev.id)]);
  const { cps, checkins, registered: total } = doors;
```

    - Replace the `OverviewStats` element with

```tsx
      <OverviewStats
        checkedIn={running ? doors.tallies[running.id]?.arrived ?? 0 : 0}
        registered={running ? doors.tallies[running.id]?.expected ?? total : total}
        scope={running?.name ?? null}
        booking={Boolean(running?.activity_id)}
      />
```

    - Add `import { loadDoors } from "@/lib/db/doors";`.
    - Remove the now-unused imports: `listCheckpoints`, `listCheckinsForEvent` and `checkedInCount`. Keep `countAttendees`; the check-in-off branch uses it. Let eslint confirm.

- [ ] **Step 3: The Bookings tab data.** In `src/app/admin/events/[id]/activities/[activityId]/page.tsx`, `BookingDetail`:
  - **Imports:** `import Link from "next/link";`, `import { listCheckpoints } from "@/lib/db/checkpoints";`, `import { listCheckinsForEvent } from "@/lib/db/checkins";` and `import { boardsByDay } from "@/lib/booking-door";`. Also add `Checkin` and `Checkpoint` to the existing `import type { Activity, Event } from "@/lib/types";`. `nowInKL` is already imported.
  - **After the first `Promise.all`**, add

```ts
  // Arrival marks (D324) exist only where check-in runs; an event without it never reads doors.
  const [cps, checkins]: [Checkpoint[], Checkin[]] = ev.check_in_enabled
    ? await Promise.all([listCheckpoints(ev.id), listCheckinsForEvent(ev.id)])
    : [[], []];
  const hasDoor = cps.some((c) => c.activity_id === activity.id);
```

  - **After `nameOf` is defined**, add

```ts
  const boards = boardsByDay(activity.id, cps, checkins, sessions, activityBookings, new Map(attendees.map((a) => [a.id, a.name])), nowInKL());
```

  - **Replace the `bookingDays` construction** with

```ts
  const bookingDays = groupSessionsByDay(seats).map((g) => {
    const board = boards.get(g.day);
    return {
      day: g.day,
      walkIns: board?.walkIns.map((w) => w.name) ?? [],
      sessions: g.items.map((i) => {
        const slot = board?.slots.find((s) => s.id === i.session.id);
        return {
          id: i.session.id,
          time: i.session.ends_at ? `${i.session.starts_at}–${i.session.ends_at}` : i.session.starts_at,
          location: i.session.location,
          booked: i.booked,
          capacity: i.session.capacity,
          came: slot ? slot.arrived : null,
          people: slot
            ? slot.people.map((p) => ({ name: p.name, mark: p.arrivedAt ? "arrived" as const : p.noShow ? "no-show" as const : null }))
            : activityBookings.filter((b) => b.session_id === i.session.id).map((b) => ({ name: nameOf(b.attendee_id), mark: null })).sort((x, y) => x.name.localeCompare(y.name)),
        };
      }),
    };
  });
```

  - **In the "Who booked" card**, above `<BookingsByDay …/>`, add

```tsx
              {ev.check_in_enabled && !hasDoor && sessions.length > 0 && (
                <p className="mb-4 text-sm text-muted-foreground">
                  To track who turns up, add a checkpoint for this activity in{" "}
                  <Link href={`/admin/events/${ev.id}/settings`} className="font-semibold text-primary underline-offset-4 hover:underline">Settings › Checkpoints</Link>.
                </p>
              )}
```

- [ ] **Step 4: The marks.** Replace `src/components/admin/BookingsByDay.tsx` with

```tsx
import { Check, X } from "lucide-react";
import { shortDate } from "@/lib/text";

type Person = { name: string; mark: "arrived" | "no-show" | null };
type Row = { id: string; time: string; location: string | null; booked: number; capacity: number; came: number | null; people: Person[] };

/**
 * Who is in which session (D237) — what used to need the export. Grouped by day, in session order.
 * On a day with a booking door (D324) each name also says whether they came: a tick, a
 * "no-show" once the slot has ended, nothing while it is still to come.
 */
export function BookingsByDay({ days }: { days: { day: string; walkIns: string[]; sessions: Row[] }[] }) {
  if (days.length === 0) return <p className="text-sm text-muted-foreground">No sessions yet. Add them on the Setup tab.</p>;
  return (
    <div className="flex flex-col gap-5">
      {days.map((d) => (
        <section key={d.day} aria-label={shortDate(d.day)}>
          <h3 className="mb-2 text-sm font-extrabold">{shortDate(d.day)}</h3>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {d.sessions.map((s) => (
              <li key={s.id} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[8rem_1fr_auto] sm:items-baseline sm:gap-3">
                <span className="text-sm font-bold tabular-nums">{s.time}{s.location ? <span className="block text-xs font-semibold text-muted-foreground">{s.location}</span> : null}</span>
                <span className="text-sm">
                  {s.people.length ? s.people.map((p, i) => (
                    <span key={`${p.name}-${i}`}>
                      {i > 0 && ", "}
                      {p.mark === "arrived" && <><Check aria-hidden="true" className="mr-0.5 inline size-3.5 align-[-2px] text-success-strong" /><span className="sr-only">(arrived) </span></>}
                      {p.mark === "no-show" && <X aria-hidden="true" className="mr-0.5 inline size-3.5 align-[-2px] text-destructive-strong" />}
                      {p.name}
                      {p.mark === "no-show" && <span className="text-destructive-strong"> (no-show)</span>}
                    </span>
                  )) : <span className="text-muted-foreground">Nobody yet</span>}
                </span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                  {s.booked} / {s.capacity}{s.came !== null ? ` · ${s.came} came` : ""}
                </span>
              </li>
            ))}
          </ul>
          {d.walkIns.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground"><span className="font-semibold">Walk-ins:</span> {d.walkIns.join(", ")}</p>
          )}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck, lint, full tests, build.** Run:
  - `npx tsc --noEmit -p .`
  - `npx eslint "src/app/admin/events/[id]/page.tsx" src/components/admin/OverviewStats.tsx "src/app/admin/events/[id]/activities/[activityId]/page.tsx" src/components/admin/BookingsByDay.tsx`
  - `npx vitest run`
  - `npm run build`

  Expected: all clean and PASS.

- [ ] **Step 6: Full browser pass on the test event, never ecphub.**
  - **Overview:** set the booking door as running. The cards read "n of m" against bookers, with the third card "Booked". Set an ordinary door; the cards return to "Registered".
  - **Bookings tab:**
    - Ticks show for arrivals and "(no-show)" for the ended slot's missing bookers. Slot counts read "· n came", and the "Walk-ins:" line shows.
    - Delete the booking door. The tab shows the Settings hint instead, and the marks disappear.
  - **Scanner:** repeat Task 4 Step 6 quickly.
  - **Ordinary door:** Registration still works end to end.
  - **Export:** the attendance export downloads, with the booking door as one more column.

- [ ] **Step 7: Clean up the test data** you created: the booking activity (its door becomes ordinary, D329) and the door. Leave the event as you found it.

- [ ] **Step 8: Commit and push.**

```bash
git add "src/app/admin/events/[id]/page.tsx" src/components/admin/OverviewStats.tsx "src/app/admin/events/[id]/activities/[activityId]/page.tsx" src/components/admin/BookingsByDay.tsx
git commit -m "feat(check-in): Overview counts booking doors against bookers; Bookings tab marks arrivals and no-shows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git pull --rebase && git push
```
