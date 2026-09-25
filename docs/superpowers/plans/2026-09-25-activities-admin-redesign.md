# Activities Admin Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activity admin pages open on a Setup tab with monitoring in sibling tabs, sessions are generated in bulk and grouped by day, and questions are edited as cards.

**Architecture:** The detail route keeps its three kind branches; each renders a header, a link-based tab strip driven by `?tab=`, and the current tab's content. All logic that can be pure is pure and unit-tested (`session-slots.ts`, `activity-tabs.ts`, `questionFormEntries`); components are verified in the browser because vitest runs `tests/**/*.test.ts` in a node environment only.

**Tech Stack:** Next.js (app router, server actions — read `node_modules/next/dist/docs/` before using an API you are unsure of), React 19, TypeScript, Tailwind, shadcn on Base UI, Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-25-activities-admin-redesign-design.md` (D234–D247)

## Global Constraints

- The field contract `q_${n}_label|key|type|required|options|description|show_key|show_value` read by `questionsFromForm` does not change (D247).
- A saved question's key never changes when its label does (D244).
- No `is_open` field in any setup form (D127); the header switch owns it.
- Bulk session generation refuses more than 200 sessions in one go (D241).
- Browser verification happens on a test event (e.g. `ecpkom`, id `4e64a90c-728c-4a08-af62-8c8046afa0c9`), never on `ecphub` or `ecpwellness`.
- Comments match the codebase: explain *why*, cite decision numbers (`(D240)`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Slot maths — `generateSlots`, `readSlotForm`, `groupSessionsByDay`

**Files:**
- Create: `src/lib/session-slots.ts`
- Test: `tests/session-slots.test.ts`

**Interfaces:**
- Consumes: `ActivitySession` (`src/lib/types.ts`), `SessionSeats` (`src/lib/activities.ts`)
- Produces:
  - `type SlotInput = { days: string[]; from: string; to: string; every: number; breaks: { from: string; to: string }[]; capacity: number; location: string | null }`
  - `type NewSlot = { day: string; starts_at: string; ends_at: string; location: string | null; capacity: number }`
  - `type SlotPlan = { ok: true; slots: NewSlot[]; skipped: number } | { ok: false; error: string }`
  - `const MAX_SLOTS = 200`
  - `generateSlots(input: SlotInput, existing?: Pick<ActivitySession, "day" | "starts_at">[]): SlotPlan`
  - `readSlotForm(fd: FormData): SlotInput`
  - `describeAdded(added: number, skipped: number): string`
  - `type DayGroup = { day: string; items: SessionSeats[]; booked: number; seats: number; location: string | null }`
  - `groupSessionsByDay(items: SessionSeats[]): DayGroup[]`

- [ ] **Step 1: Write the failing tests** in `tests/session-slots.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeAdded, generateSlots, groupSessionsByDay, MAX_SLOTS, readSlotForm, type SlotInput } from "@/lib/session-slots";
import type { ActivitySession } from "@/lib/types";

const base: SlotInput = { days: ["2026-09-28"], from: "11:00", to: "12:00", every: 15, breaks: [], capacity: 3, location: "Gardensby17" };
const starts = (p: ReturnType<typeof generateSlots>) => (p.ok ? p.slots.map((s) => `${s.day} ${s.starts_at}-${s.ends_at}`) : p.error);

describe("generateSlots", () => {
  it("steps from the start and keeps only slots that end by the end time", () => {
    expect(starts(generateSlots({ ...base, to: "11:50" }))).toEqual([
      "2026-09-28 11:00-11:15", "2026-09-28 11:15-11:30", "2026-09-28 11:30-11:45",
    ]);
  });

  it("drops any slot that touches a break and resumes on the step grid after it", () => {
    const p = generateSlots({ ...base, from: "12:40", to: "14:20", every: 20, breaks: [{ from: "13:00", to: "14:00" }] });
    expect(starts(p)).toEqual(["2026-09-28 12:40-13:00", "2026-09-28 14:00-14:20"]);
  });

  it("makes InBody's 32 sessions: two days, 11:00-16:00, 15 minutes, lunch 13:00-14:00", () => {
    const p = generateSlots({ ...base, days: ["2026-09-29", "2026-09-28"], to: "16:00", breaks: [{ from: "13:00", to: "14:00" }] });
    expect(p.ok && p.slots.length).toBe(32);
    expect(p.ok && p.slots[0]).toEqual({ day: "2026-09-28", starts_at: "11:00", ends_at: "11:15", location: "Gardensby17", capacity: 3 });
  });

  it("skips slots that already exist and counts them", () => {
    const existing: Pick<ActivitySession, "day" | "starts_at">[] = [{ day: "2026-09-28", starts_at: "11:15" }];
    const p = generateSlots({ ...base, to: "11:45" }, existing);
    expect(p).toEqual({ ok: true, skipped: 1, slots: [
      { day: "2026-09-28", starts_at: "11:00", ends_at: "11:15", location: "Gardensby17", capacity: 3 },
      { day: "2026-09-28", starts_at: "11:30", ends_at: "11:45", location: "Gardensby17", capacity: 3 },
    ] });
  });

  it("refuses bad input with a sentence, and never truncates past the cap", () => {
    expect(generateSlots({ ...base, days: [] })).toEqual({ ok: false, error: "Pick at least one day" });
    expect(generateSlots({ ...base, from: "12:00", to: "11:00" })).toEqual({ ok: false, error: "The end time must be after the start time" });
    expect(generateSlots({ ...base, every: 2 })).toEqual({ ok: false, error: "Each session must last between 5 and 240 minutes" });
    expect(generateSlots({ ...base, capacity: 0 })).toEqual({ ok: false, error: "Seats must be at least 1" });
    expect(generateSlots({ ...base, breaks: [{ from: "13:00", to: "" }] })).toEqual({ ok: false, error: "A break needs a start and an end, in that order" });
    const big = generateSlots({ ...base, from: "00:00", to: "23:55", every: 5 });
    expect(big).toEqual({ ok: false, error: `That makes more than ${MAX_SLOTS} sessions. Split it into smaller batches.` });
    expect(generateSlots({ ...base, to: "11:10" })).toEqual({ ok: false, error: "No session fits between those times" });
    expect(generateSlots({ ...base, to: "11:15" }, [{ day: "2026-09-28", starts_at: "11:00" }])).toEqual({ ok: false, error: "Those sessions all exist already" });
  });

  it("ignores a blank break row", () => {
    expect(generateSlots({ ...base, breaks: [{ from: "", to: "" }] }).ok).toBe(true);
  });
});

describe("readSlotForm", () => {
  it("reads repeated day and break fields", () => {
    const fd = new FormData();
    fd.append("day", "2026-09-28"); fd.append("day", "2026-09-29"); fd.append("day", "");
    fd.set("from", "11:00"); fd.set("to", "16:00"); fd.set("every", "15"); fd.set("capacity", "3"); fd.set("location", "  Gardensby17 ");
    fd.append("break_from", "13:00"); fd.append("break_to", "14:00");
    expect(readSlotForm(fd)).toEqual({
      days: ["2026-09-28", "2026-09-29"], from: "11:00", to: "16:00", every: 15,
      breaks: [{ from: "13:00", to: "14:00" }], capacity: 3, location: "Gardensby17",
    });
  });

  it("turns a blank location into null", () => {
    const fd = new FormData();
    fd.set("location", " ");
    expect(readSlotForm(fd).location).toBeNull();
  });
});

describe("describeAdded", () => {
  it("says what happened, and what was skipped only when something was", () => {
    expect(describeAdded(1, 0)).toBe("Added 1 session.");
    expect(describeAdded(28, 4)).toBe("Added 28 sessions. 4 already existed.");
    expect(describeAdded(3, 1)).toBe("Added 3 sessions. 1 already existed.");
  });
});

describe("groupSessionsByDay", () => {
  const seat = (id: string, day: string, starts_at: string, capacity: number, booked: number, location: string | null = "Hall") => ({
    session: { id, event_id: "e", activity_id: "a", day, starts_at, ends_at: null, location, capacity, sort_order: 0 },
    booked, left: Math.max(0, capacity - booked), full: booked >= capacity,
  });

  it("keeps the given order, totals each day, and names the day's usual location", () => {
    const groups = groupSessionsByDay([
      seat("1", "2026-09-28", "11:00", 3, 1), seat("2", "2026-09-28", "11:15", 3, 2, "Annex"), seat("3", "2026-09-28", "11:30", 3, 0),
      seat("4", "2026-09-29", "11:00", 5, 5, null),
    ]);
    expect(groups.map((g) => [g.day, g.items.map((i) => i.session.id), g.booked, g.seats, g.location])).toEqual([
      ["2026-09-28", ["1", "2", "3"], 3, 9, "Hall"],
      ["2026-09-29", ["4"], 5, 5, null],
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/session-slots.test.ts`
Expected: FAIL — cannot resolve `@/lib/session-slots`.

- [ ] **Step 3: Implement** `src/lib/session-slots.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/session-slots.test.ts`
Expected: PASS (all tests). If the "Give a start and an end time" branch is untested that is fine; do not add assertions the spec does not ask for.

- [ ] **Step 5: Commit**

```bash
git add src/lib/session-slots.ts tests/session-slots.test.ts docs/superpowers/specs/2026-09-25-activities-admin-redesign-design.md
git commit -m "feat(activities): slot maths for bulk sessions and day grouping (D240, D241)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tab model — `activityTabs`, `resolveTab`, `activityHref`

**Files:**
- Create: `src/lib/activity-tabs.ts`
- Test: `tests/activity-tabs.test.ts`

**Interfaces:**
- Consumes: `ActivityKind` (`src/lib/types.ts`)
- Produces:
  - `type ActivityTab = "setup" | "bookings" | "not-booked" | "submissions" | "not-submitted" | "participation"`
  - `type TabCounts = { booked?: number; notBooked?: number; pendingRequests?: number; submissions?: number; notSubmitted?: number; perDay?: boolean }`
  - `type TabItem = { tab: ActivityTab; label: string; count: number | null; dot: boolean }`
  - `activityTabs(kind: ActivityKind, counts: TabCounts): TabItem[]`
  - `resolveTab(tabs: TabItem[], requested: string | undefined): ActivityTab`
  - `activityHref(eventId: string, activityId: string, tab?: ActivityTab, extra?: Record<string, string>): string`

- [ ] **Step 1: Write the failing tests** in `tests/activity-tabs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { activityHref, activityTabs, resolveTab } from "@/lib/activity-tabs";

describe("activityTabs", () => {
  it("gives a booking Setup, Bookings and Not booked, with a dot while requests wait", () => {
    expect(activityTabs("booking", { booked: 12, notBooked: 30, pendingRequests: 2 })).toEqual([
      { tab: "setup", label: "Setup", count: null, dot: false },
      { tab: "bookings", label: "Bookings", count: 12, dot: true },
      { tab: "not-booked", label: "Not booked", count: 30, dot: false },
    ]);
    expect(activityTabs("booking", { booked: 0, notBooked: 0, pendingRequests: 0 })[1].dot).toBe(false);
  });

  it("gives a submission Participation only when it runs per day", () => {
    const once = activityTabs("submission", { submissions: 4, notSubmitted: 9, perDay: false }).map((t) => t.tab);
    expect(once).toEqual(["setup", "submissions", "not-submitted"]);
    const daily = activityTabs("submission", { submissions: 4, notSubmitted: 9, perDay: true }).map((t) => t.tab);
    expect(daily).toEqual(["setup", "submissions", "not-submitted", "participation"]);
  });

  it("gives a passport Setup alone", () => {
    expect(activityTabs("passport", {}).map((t) => t.tab)).toEqual(["setup"]);
  });
});

describe("resolveTab", () => {
  const tabs = activityTabs("booking", { booked: 0, notBooked: 0 });
  it("takes a tab this kind has and falls back to Setup otherwise", () => {
    expect(resolveTab(tabs, "not-booked")).toBe("not-booked");
    expect(resolveTab(tabs, "participation")).toBe("setup");
    expect(resolveTab(tabs, undefined)).toBe("setup");
    expect(resolveTab(tabs, "nonsense")).toBe("setup");
  });
});

describe("activityHref", () => {
  it("leaves Setup bare, since it is the default, and carries other tabs and extras", () => {
    expect(activityHref("e", "a")).toBe("/admin/events/e/activities/a");
    expect(activityHref("e", "a", "setup")).toBe("/admin/events/e/activities/a");
    expect(activityHref("e", "a", "not-booked")).toBe("/admin/events/e/activities/a?tab=not-booked");
    expect(activityHref("e", "a", "not-submitted", { day: "2026-09-28" })).toBe("/admin/events/e/activities/a?tab=not-submitted&day=2026-09-28");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/activity-tabs.test.ts`
Expected: FAIL — cannot resolve `@/lib/activity-tabs`.

- [ ] **Step 3: Implement** `src/lib/activity-tabs.ts`:

```ts
import type { ActivityKind } from "@/lib/types";

/**
 * Which tabs an activity page has (D234, D235), and the one URL shape every link and redirect
 * to them uses (D239). Setup is the default, so its URL carries no `tab` at all: a bare link
 * to an activity is a link to its setup, which is what the organiser comes back for.
 */
export type ActivityTab = "setup" | "bookings" | "not-booked" | "submissions" | "not-submitted" | "participation";

export type TabCounts = {
  booked?: number;
  notBooked?: number;
  pendingRequests?: number;
  submissions?: number;
  notSubmitted?: number;
  perDay?: boolean;
};

export type TabItem = { tab: ActivityTab; label: string; count: number | null; dot: boolean };

const item = (tab: ActivityTab, label: string, count: number | null = null, dot = false): TabItem => ({ tab, label, count, dot });

export function activityTabs(kind: ActivityKind, c: TabCounts): TabItem[] {
  const setup = item("setup", "Setup");
  if (kind === "booking") {
    // The dot, because pending requests left the landing view when Setup became it (D235).
    return [setup, item("bookings", "Bookings", c.booked ?? 0, (c.pendingRequests ?? 0) > 0), item("not-booked", "Not booked", c.notBooked ?? 0)];
  }
  if (kind === "submission") {
    const tabs = [setup, item("submissions", "Submissions", c.submissions ?? 0), item("not-submitted", "Not submitted", c.notSubmitted ?? 0)];
    return c.perDay ? [...tabs, item("participation", "Participation")] : tabs;
  }
  return [setup];
}

/** A requested tab this page does not have (a stale link, a hand-edited URL) opens Setup. */
export function resolveTab(tabs: TabItem[], requested: string | undefined): ActivityTab {
  return tabs.find((t) => t.tab === requested)?.tab ?? "setup";
}

export function activityHref(eventId: string, activityId: string, tab: ActivityTab = "setup", extra: Record<string, string> = {}): string {
  const path = `/admin/events/${eventId}/activities/${activityId}`;
  const qs = new URLSearchParams();
  if (tab !== "setup") qs.set("tab", tab);
  for (const [k, v] of Object.entries(extra)) qs.set(k, v);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/activity-tabs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/activity-tabs.ts tests/activity-tabs.test.ts
git commit -m "feat(activities): tab model and URL shape for activity pages (D234, D235, D239)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Question drafts — `questionFormEntries` and the shared key rule

**Files:**
- Modify: `src/lib/questions-form.ts`
- Test: `tests/questions-form.test.ts` (exists; append the new `describe` and merge the imports)

**Interfaces:**
- Consumes: `questionsFromForm` (same file), `RegistrationQuestion`, `QuestionType`
- Produces:
  - `keyFor(keyOrLabel: string): string` — the slug rule `questionsFromForm` uses
  - `type QuestionDraft = { key: string; label: string; type: QuestionType; required: boolean; options: string[]; description: string; showKey: string; showValue: string }`
  - `draftFrom(q: RegistrationQuestion): QuestionDraft`
  - `questionFormEntries(drafts: QuestionDraft[]): [string, string][]`

- [ ] **Step 1: Write the failing tests** (append to `tests/questions-form.test.ts`, creating the file with the imports if needed):

```ts
import { describe, expect, it } from "vitest";
import { draftFrom, keyFor, questionFormEntries, questionsFromForm } from "@/lib/questions-form";
import { FORM_QUESTION_TYPES } from "@/lib/registration";
import type { RegistrationQuestion } from "@/lib/types";

const read = (entries: [string, string][]) => {
  const map = new Map(entries);
  return questionsFromForm((k) => map.get(k) ?? null, FORM_QUESTION_TYPES, 10);
};

describe("questionFormEntries", () => {
  const saved: RegistrationQuestion[] = [
    { key: "goal", label: "Your goal", type: "textarea", required: true },
    { key: "track", label: "Track", type: "select", required: false, options: ["Weight", "Muscle"], description: "Pick one" },
    { key: "target_kg", label: "Target (kg)", type: "number", required: false, show_when: { key: "track", includes: "Weight" } },
  ];

  it("round-trips saved questions through the fields questionsFromForm reads (D247)", () => {
    expect(read(questionFormEntries(saved.map(draftFrom)))).toEqual(saved);
  });

  it("keeps a saved key when the label changes, so stored answers stay attached (D244)", () => {
    const [first] = saved.map(draftFrom);
    expect(read(questionFormEntries([{ ...first, label: "What is your goal?" }]))[0].key).toBe("goal");
  });

  it("gives a new question the key its label makes, the same rule keyFor states", () => {
    const fresh = { key: "", label: "Before photo", type: "file" as const, required: true, options: [], description: "", showKey: "", showValue: "" };
    expect(read(questionFormEntries([fresh]))[0].key).toBe("before_photo");
    expect(keyFor("Before photo")).toBe("before_photo");
  });

  it("numbers questions in their on-screen order and drops unlabelled drafts", () => {
    const drafts = saved.map(draftFrom).reverse();
    drafts.splice(1, 0, { key: "", label: "", type: "text", required: false, options: [], description: "", showKey: "", showValue: "" });
    expect(read(questionFormEntries(drafts)).map((q) => q.key)).toEqual(["target_kg", "track", "goal"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/questions-form.test.ts`
Expected: FAIL — `draftFrom`/`keyFor`/`questionFormEntries` are not exported.

- [ ] **Step 3: Implement** in `src/lib/questions-form.ts`. Add `keyFor`, use it inside `questionsFromForm` in place of both `slugify(...).replace(/-/g, "_")` calls, and add the draft helpers:

```ts
/** How a key is derived: from a typed key, or from the label when there is none. One rule, shared with the question cards. */
export function keyFor(keyOrLabel: string): string {
  return slugify(keyOrLabel).replace(/-/g, "_");
}

/** A question as the card editor holds it: every field a string, choices as a list, the condition split in two. */
export type QuestionDraft = {
  /** The saved key, or "" for a question that has never been saved. */
  key: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options: string[];
  description: string;
  showKey: string;
  showValue: string;
};

export function draftFrom(q: RegistrationQuestion): QuestionDraft {
  return {
    key: q.key, label: q.label, type: q.type, required: q.required, options: q.options ?? [],
    description: q.description ?? "", showKey: q.show_when?.key ?? "", showValue: q.show_when?.includes ?? "",
  };
}

/**
 * The fields the card editor posts, numbered 1…n in on-screen order: exactly the contract the
 * table posted, so `questionsFromForm` and both forms' actions stay as they are (D247). A
 * never-saved question posts an empty key and gets one from its label on the server, as a
 * blank key always has; a saved one posts its own, so a new label never orphans its answers (D244).
 */
export function questionFormEntries(drafts: QuestionDraft[]): [string, string][] {
  const out: [string, string][] = [];
  drafts.forEach((d, i) => {
    const n = i + 1;
    out.push([`q_${n}_label`, d.label], [`q_${n}_key`, d.key], [`q_${n}_type`, d.type]);
    if (d.required) out.push([`q_${n}_required`, "on"]);
    out.push([`q_${n}_options`, d.options.join(", ")], [`q_${n}_description`, d.description]);
    out.push([`q_${n}_show_key`, d.showKey], [`q_${n}_show_value`, d.showValue]);
  });
  return out;
}
```

Inside `questionsFromForm`, the two derivations become `const key = keyFor(keyRaw);` and `show_when: { key: keyFor(showKey), includes: showValue }`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/questions-form.test.ts tests/registration.test.ts`
Expected: PASS (the registration tests guard the unchanged parser).

- [ ] **Step 5: Commit**

```bash
git add src/lib/questions-form.ts tests/questions-form.test.ts
git commit -m "feat(questions): drafts and form entries for a card editor, same field contract (D244, D247)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Session writes — bulk add, delete a day, drop manual reorder, tab-aware redirects

**Files:**
- Modify: `src/lib/db/activities.ts` (add `createSessions`, `deleteSessionsOnDay`; delete `setSessionOrder` and `createSession`)
- Modify: `src/app/admin/events/[id]/activities/actions.ts`

**Interfaces:**
- Consumes: `generateSlots`, `readSlotForm`, `describeAdded`, `NewSlot` (Task 1); `activityHref`, `ActivityTab` (Task 2)
- Produces:
  - `createSessions(eventId: string, activityId: string, inputs: NewSession[]): Promise<void>`
  - `deleteSessionsOnDay(eventId: string, activityId: string, day: string): Promise<number>`
  - `addSessionsAction(eventId: string, activityId: string, fd: FormData): Promise<void>`
  - `deleteSessionDayAction(eventId: string, activityId: string, day: string): Promise<void>`
  - `toggleOpenAction(eventId, activityId, from: "list" | ActivityTab)` (was `"list" | "page"`)

- [ ] **Step 1: Add the db functions** in `src/lib/db/activities.ts`, replacing `createSession` and deleting `setSessionOrder`:

```ts
/** One insert for a whole batch (D241): it all lands or none of it does. `sort_order` only breaks ties between sessions starting together, so it continues from the last. */
export async function createSessions(eventId: string, activityId: string, inputs: NewSession[]): Promise<void> {
  if (inputs.length === 0) return;
  const db = serviceClient();
  const { data: last } = await db.from("activity_sessions").select("sort_order")
    .eq("activity_id", activityId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const start = (last?.sort_order ?? -1) + 1;
  const { error } = await db.from("activity_sessions")
    .insert(inputs.map((input, i) => ({ event_id: eventId, activity_id: activityId, ...input, sort_order: start + i })));
  if (error) throw error;
}

/** Every session of one activity on one day (D242). Bookings cascade, as with a single session (D135). */
export async function deleteSessionsOnDay(eventId: string, activityId: string, day: string): Promise<number> {
  const { data, error } = await serviceClient().from("activity_sessions").delete()
    .eq("event_id", eventId).eq("activity_id", activityId).eq("day", day).select("id");
  if (error) throw error;
  return data?.length ?? 0;
}
```

- [ ] **Step 2: Rewrite the session actions** in `actions.ts`. Replace the imports of `createSession`/`setSessionOrder` with `createSessions`/`deleteSessionsOnDay`; import `generateSlots, readSlotForm, describeAdded` from `@/lib/session-slots`, `activityHref, type ActivityTab` from `@/lib/activity-tabs`, and `shortDate` from `@/lib/text`. Delete `addSessionAction` and `reorderSessionsAction`. Add:

```ts
/**
 * Adds every session the bulk dialog describes (D241). A single session is the same dialog with
 * one slot, so this is the only way sessions are added. Slots this activity already has are
 * skipped and counted rather than duplicated.
 */
export async function addSessionsAction(eventId: string, activityId: string, fd: FormData) {
  const ev = await event(eventId);
  await bookingOf(ev, activityId);
  const back = activityHref(eventId, activityId);
  const existing = (await listSessions(ev.id)).filter((s) => s.activity_id === activityId);
  const plan = generateSlots(readSlotForm(fd), existing);
  if (!plan.ok) redirect(flashPath(back, plan.error, "error"));
  await createSessions(ev.id, activityId, plan.slots);
  revalidatePath(listPath(eventId));
  revalidatePath(detailPath(eventId, activityId));
  redirect(flashPath(back, describeAdded(plan.slots.length, plan.skipped)));
}

/** A whole day's sessions, and their bookings with them (D242, D135). The confirm dialog says how many. */
export async function deleteSessionDayAction(eventId: string, activityId: string, day: string) {
  const ev = await event(eventId);
  await bookingOf(ev, activityId);
  const removed = await deleteSessionsOnDay(ev.id, activityId, day);
  const back = activityHref(eventId, activityId);
  revalidatePath(listPath(eventId));
  revalidatePath(detailPath(eventId, activityId));
  redirect(flashPath(back, `Deleted ${removed} session${removed === 1 ? "" : "s"} on ${shortDate(day)}.`));
}
```

`saveSessionAction` gains a `redirect(flashPath(activityHref(eventId, activityId), "Session saved."))` after its revalidate, so the edit dialog closes on save the way every other form here does.

- [ ] **Step 3: Make redirects tab-aware (D239)** in `actions.ts`:
  - `placeAttendeesAction`: `const path = activityHref(eventId, activityId, "not-booked");`
  - `approveRequestAction` and `declineRequestAction`: `const path = activityHref(eventId, activityId, "bookings");`
  - `toggleOpenAction`: change the parameter to `from: "list" | ActivityTab` and the target to `const path = from === "list" ? listPath(eventId) : activityHref(eventId, activityId, from);`
  - Remove the now-stale comment references to `reorderSessionsAction`/`setSessionOrder` (lines near the placement and request actions): reword them to name the guard they describe without the deleted function.

- [ ] **Step 4: Typecheck** — the detail page still references the removed actions and will fail; that is fixed in Task 6. Confirm the only errors are in `[activityId]/page.tsx` and the list page's `toggleOpenAction` call:

Run: `npx tsc --noEmit -p .`
Expected: errors only in `src/app/admin/events/[id]/activities/[activityId]/page.tsx` (missing `addSessionAction`, `reorderSessionsAction`, `SessionList` props) and `PassportDetail.tsx`/list `page.tsx` for the `"page"` literal. Do not commit yet; Task 5 and 6 land with it.

---

### Task 5: `SessionDays` and `AddSessionsDialog` components

**Files:**
- Create: `src/components/admin/AddSessionsDialog.tsx`
- Create: `src/components/admin/SessionDays.tsx`
- Delete: `src/components/admin/SessionList.tsx`

**Interfaces:**
- Consumes: `generateSlots`, `groupSessionsByDay`, `SlotInput` (Task 1); `SessionSeats`, `sessionLabel` (`src/lib/activities.ts`); `Modal`, `Field`, `SubmitButton`, `ConfirmButton` (admin components)
- Produces:
  - `AddSessionsDialog({ addSessions, existing, defaultDay }: { addSessions: (fd: FormData) => Promise<void>; existing: { day: string; starts_at: string }[]; defaultDay: string | null })`
  - `SessionDays({ items, addSessions, saveSession, deleteSession, deleteDay, defaultDay }: { items: SessionSeats[]; addSessions: (fd: FormData) => Promise<void>; saveSession: (sessionId: string, fd: FormData) => Promise<void>; deleteSession: (sessionId: string) => Promise<void>; deleteDay: (day: string) => Promise<void>; defaultDay: string | null })`

- [ ] **Step 1: Write `AddSessionsDialog.tsx`**:

```tsx
"use client";
import { useState } from "react";
import { generateSlots } from "@/lib/session-slots";
import { Modal } from "@/components/admin/Modal";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Button } from "@/components/ui/button";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const label = "text-sm font-bold";

/**
 * The only way sessions are added (D241): days × a time range, stepped, minus breaks. The count
 * under the form comes from the same `generateSlots` the server runs, so "Makes 32 sessions" is
 * what lands, and the server still re-checks everything it is sent.
 */
export function AddSessionsDialog({ addSessions, existing, defaultDay }: {
  addSessions: (fd: FormData) => Promise<void>;
  existing: { day: string; starts_at: string }[];
  defaultDay: string | null;
}) {
  const [days, setDays] = useState<string[]>([defaultDay ?? ""]);
  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("10:00");
  const [every, setEvery] = useState("30");
  const [breaks, setBreaks] = useState<{ from: string; to: string }[]>([]);
  const [capacity, setCapacity] = useState("20");
  const [location, setLocation] = useState("");

  const plan = generateSlots({
    days, from, to, every: Number.parseInt(every, 10), breaks,
    capacity: Number.parseInt(capacity, 10), location: location.trim() || null,
  }, existing);
  const summary = plan.ok
    ? `Makes ${plan.slots.length} session${plan.slots.length === 1 ? "" : "s"}${plan.skipped ? ` (${plan.skipped} already exist)` : ""}`
    : plan.error;

  return (
    <Modal title="Add sessions" hint="Pick the days and a time range; it makes one session per step." trigger="Add sessions" icon="plus">
      <form action={addSessions} className="grid gap-4">
        <fieldset className="grid gap-2">
          <legend className={`${label} mb-1.5`}>Days</legend>
          {days.map((d, i) => (
            <div key={i} className="flex gap-2">
              <input name="day" type="date" value={d} aria-label={`Day ${i + 1}`} className={input}
                onChange={(e) => setDays(days.map((x, j) => (j === i ? e.target.value : x)))} />
              {days.length > 1 && (
                <Button type="button" variant="ghost" onClick={() => setDays(days.filter((_, j) => j !== i))} aria-label={`Remove day ${i + 1}`}>Remove</Button>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setDays([...days, ""])}>Add day</Button>
        </fieldset>

        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-1.5"><span className={label}>From</span>
            <input name="from" type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={input} /></label>
          <label className="grid gap-1.5"><span className={label}>To</span>
            <input name="to" type="time" value={to} onChange={(e) => setTo(e.target.value)} className={input} /></label>
        </div>

        <label className="grid gap-1.5"><span className={label}>Each session lasts (minutes)</span>
          <input name="every" type="number" min={5} max={240} inputMode="numeric" value={every} onChange={(e) => setEvery(e.target.value)} className={`${input} tabular-nums`} /></label>

        <fieldset className="grid gap-2">
          <legend className={`${label} mb-1.5`}>Breaks to skip (optional)</legend>
          {breaks.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <input name="break_from" type="time" value={b.from} aria-label={`Break ${i + 1} from`} className={input}
                onChange={(e) => setBreaks(breaks.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} />
              <span className="text-sm text-muted-foreground">to</span>
              <input name="break_to" type="time" value={b.to} aria-label={`Break ${i + 1} to`} className={input}
                onChange={(e) => setBreaks(breaks.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} />
              <Button type="button" variant="ghost" onClick={() => setBreaks(breaks.filter((_, j) => j !== i))} aria-label={`Remove break ${i + 1}`}>Remove</Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setBreaks([...breaks, { from: "", to: "" }])}>Add break</Button>
        </fieldset>

        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-1.5"><span className={label}>Seats per session</span>
            <input name="capacity" type="number" min={1} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} className={`${input} tabular-nums`} /></label>
          <label className="grid gap-1.5"><span className={label}>Location (optional)</span>
            <input name="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room 2A" className={input} /></label>
        </div>

        <p role="status" className={`text-sm ${plan.ok ? "text-muted-foreground" : "text-destructive"}`}>{summary}</p>
        <SubmitButton>{plan.ok ? `Add ${plan.slots.length} session${plan.slots.length === 1 ? "" : "s"}` : "Add sessions"}</SubmitButton>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Write `SessionDays.tsx`**:

```tsx
"use client";
import { groupSessionsByDay } from "@/lib/session-slots";
import { sessionLabel, type SessionSeats } from "@/lib/activities";
import { meterPercent } from "@/lib/meter";
import { shortDate } from "@/lib/text";
import { AddSessionsDialog } from "@/components/admin/AddSessionsDialog";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Progress } from "@/components/ui/progress";

/**
 * An activity's sessions as the Setup tab shows them (D240): one section per day, a compact row
 * per session, in the order `listSessions` gives (day, then start time). A row names its room
 * only when it differs from the day's usual one. Clicking a row edits it; Delete lives in that
 * dialog, and a whole day goes from its header (D242).
 */
export function SessionDays({ items, addSessions, saveSession, deleteSession, deleteDay, defaultDay }: {
  items: SessionSeats[];
  addSessions: (fd: FormData) => Promise<void>;
  saveSession: (sessionId: string, fd: FormData) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  deleteDay: (day: string) => Promise<void>;
  defaultDay: string | null;
}) {
  const days = groupSessionsByDay(items);
  const existing = items.map((i) => ({ day: i.session.day, starts_at: i.session.starts_at }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <AddSessionsDialog addSessions={addSessions} existing={existing} defaultDay={days.at(-1)?.day ?? defaultDay} />
      </div>
      {days.length === 0 && <p className="pb-2 text-sm text-muted-foreground">No sessions yet. Add some to let attendees book a seat.</p>}
      {days.map((g) => {
        const bookings = g.booked;
        return (
          <section key={g.day} aria-label={shortDate(g.day)} className="rounded-lg border border-border">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
              <h3 className="text-sm font-extrabold">{shortDate(g.day)}</h3>
              <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                {g.items.length} session{g.items.length === 1 ? "" : "s"} · {g.booked} of {g.seats} booked{g.location ? ` · ${g.location}` : ""}
              </span>
              <form action={() => deleteDay(g.day)} className="ml-auto">
                <ConfirmButton
                  message={`Delete all ${g.items.length} sessions on ${shortDate(g.day)}?${bookings ? ` Their ${bookings} booking${bookings === 1 ? "" : "s"} go with them.` : ""}`}
                  className="text-destructive"
                >
                  Delete day
                </ConfirmButton>
              </form>
            </header>
            <ul className="divide-y divide-border">
              {g.items.map((item) => {
                const s = item.session;
                const label = sessionLabel(s);
                const time = s.ends_at ? `${s.starts_at}–${s.ends_at}` : s.starts_at;
                return (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="w-28 shrink-0 text-sm font-bold tabular-nums">{time}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground">
                      {s.location !== g.location ? (s.location ?? "No location") : ""}
                    </span>
                    <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums">{item.booked} / {s.capacity}</span>
                    <Progress className="hidden w-20 sm:block" value={meterPercent(item.booked, s.capacity)} aria-label={`${item.booked} of ${s.capacity} seats booked`} />
                    <Modal title={`Edit ${label}`} trigger="Edit" variant="ghost">
                      <form action={saveSession.bind(null, s.id)} className="grid gap-4">
                        <div className="grid grid-cols-2 gap-4">
                          <Field label="Day" name="day" type="date" defaultValue={s.day} />
                          <Field label="Seats" name="capacity" type="number" defaultValue={String(s.capacity)} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <Field label="Starts" name="starts_at" type="time" defaultValue={s.starts_at} />
                          <Field label="Ends (optional)" name="ends_at" type="time" defaultValue={s.ends_at} />
                        </div>
                        <Field label="Location (optional)" name="location" defaultValue={s.location} />
                        <SubmitButton>Save</SubmitButton>
                      </form>
                      <form action={() => deleteSession(s.id)} className="mt-3 border-t border-border pt-3">
                        <ConfirmButton
                          message={`Delete ${label}?${item.booked ? ` Its ${item.booked} booking${item.booked === 1 ? "" : "s"} go with it.` : ""}`}
                          className="text-destructive"
                        >
                          Delete session
                        </ConfirmButton>
                      </form>
                    </Modal>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
```

`shortDate` is exported from `src/lib/text.ts`; `Modal`'s `variant` is any `Button` variant, so `"ghost"` is valid.

- [ ] **Step 3: Delete** `src/components/admin/SessionList.tsx` (`git rm`). Nothing else imports it once Task 6 lands.

---

### Task 6: Tabbed detail pages and the Bookings view

**Files:**
- Create: `src/components/admin/ActivityTabs.tsx`
- Create: `src/components/admin/BookingsByDay.tsx`
- Modify: `src/app/admin/events/[id]/activities/[activityId]/page.tsx`
- Modify: `src/app/admin/events/[id]/activities/[activityId]/PassportDetail.tsx`
- Modify: `src/app/admin/events/[id]/activities/page.tsx` (menu `settingsHref`, toggle `from`)
- Modify: `src/components/admin/MissingPanel.tsx` (carry `tab` through its GET form)

**Interfaces:**
- Consumes: Task 2 (`activityTabs`, `resolveTab`, `activityHref`, `TabItem`, `ActivityTab`), Task 4 actions, Task 5 components
- Produces: `ActivityTabs({ tabs, current, href }: { tabs: TabItem[]; current: ActivityTab; href: (tab: ActivityTab) => string })`, `BookingsByDay({ days }: { days: { day: string; sessions: { id: string; time: string; location: string | null; booked: number; capacity: number; people: string[] }[] }[] })`

- [ ] **Step 1: `ActivityTabs.tsx`** (server component; plain links so a tab is a URL — D234):

```tsx
import Link from "next/link";
import { tabsListVariants } from "@/components/ui/tabs";
import type { ActivityTab, TabItem } from "@/lib/activity-tabs";

/** Links, not a client Tabs widget: the tab lives in the URL, so reload, Back and a shared link all land on it (D234). One tab shows no strip. */
export function ActivityTabs({ tabs, current, href }: { tabs: TabItem[]; current: ActivityTab; href: (tab: ActivityTab) => string }) {
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Activity sections" className={`${tabsListVariants({ variant: "default" })} h-9 max-w-full overflow-x-auto`}>
      {tabs.map((t) => {
        const on = t.tab === current;
        return (
          <Link
            key={t.tab}
            href={href(t.tab)}
            aria-current={on ? "page" : undefined}
            className={`relative inline-flex h-full items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors ${on ? "bg-background text-foreground shadow-sm" : "text-foreground/60 hover:text-foreground"}`}
          >
            {t.label}
            {t.count !== null && <span className="text-xs tabular-nums text-muted-foreground">{t.count}</span>}
            {t.dot && <span className="size-1.5 rounded-full bg-primary" aria-label="needs attention" />}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: `BookingsByDay.tsx`** (server component, D237):

```tsx
import { shortDate } from "@/lib/text";

type Row = { id: string; time: string; location: string | null; booked: number; capacity: number; people: string[] };

/** Who is in which session (D237) — what used to need the export. Grouped by day, in session order. */
export function BookingsByDay({ days }: { days: { day: string; sessions: Row[] }[] }) {
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
                <span className="text-sm">{s.people.length ? s.people.join(", ") : <span className="text-muted-foreground">Nobody yet</span>}</span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">{s.booked} / {s.capacity}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `MissingPanel.tsx`** — add an optional `tab?: string` prop; inside its `<Form action={basePath}>` render `{tab && <input type="hidden" name="tab" value={tab} />}`, and make "Back to today" link to `tab ? \`${basePath}?tab=${tab}\` : basePath`. A GET form replaces the whole query string, so without the hidden field choosing a day would drop back to Setup.

- [ ] **Step 4: Restructure `[activityId]/page.tsx`.**
  - `searchParams` gains `tab?: string`; pass `tab` to each branch (`PassportDetail` too).
  - Imports: drop `SessionList`, `addSessionAction`, `reorderSessionsAction`; add `SessionDays`, `ActivityTabs`, `BookingsByDay`, `addSessionsAction`, `deleteSessionDayAction`, `activityTabs`, `resolveTab`, `activityHref`, `shortDate`.
  - **BookingDetail** keeps every query it has. After computing `seats`, `unbooked`, `bookedCount`, `pendingRequests`:

```tsx
const tabs = activityTabs("booking", { booked: bookedCount, notBooked: unbooked.length, pendingRequests: pendingRequests.length });
const current = resolveTab(tabs, tab);
const href = (t: ActivityTab) => activityHref(ev.id, activity.id, t);
const nameOf = (id: string) => byId.get(id)?.name ?? "Unknown";
const bookingDays = groupSessionsByDay(seats).map((g) => ({
  day: g.day,
  sessions: g.items.map((i) => ({
    id: i.session.id,
    time: i.session.ends_at ? `${i.session.starts_at}–${i.session.ends_at}` : i.session.starts_at,
    location: i.session.location, booked: i.booked, capacity: i.session.capacity,
    people: activityBookings.filter((b) => b.session_id === i.session.id).map((b) => nameOf(b.attendee_id)).sort(),
  })),
}));
```

  The header keeps title and subtitle; `OpenSwitch` binds `toggleOpenAction.bind(null, ev.id, activity.id, current)`; `ActivityMenu`'s `settingsHref` becomes `href("setup")`. Then `<ActivityTabs tabs={tabs} current={current} href={href} />`, then:
  - `current === "setup"`: the existing Settings card retitled **Details and rules** (drop `id="settings"`), then the **Sessions** card containing:

```tsx
<SessionDays
  items={seats}
  addSessions={addSessionsAction.bind(null, ev.id, activity.id)}
  saveSession={saveSessionAction.bind(null, ev.id, activity.id)}
  deleteSession={deleteSessionAction.bind(null, ev.id, activity.id)}
  deleteDay={deleteSessionDayAction.bind(null, ev.id, activity.id)}
  defaultDay={ev.starts_on}
/>
```
  - `current === "bookings"`: the existing `<RequestQueue … />` (it already returns null when there are no requests), then a card **Who booked** with `<BookingsByDay days={bookingDays} />`.
  - `current === "not-booked"`: the existing Not booked card unchanged.
  - **SubmissionDetail**: tabs from `activityTabs("submission", { submissions: submissions.length, notSubmitted: missing.length, perDay: activity.per_day })`. Setup → the settings card retitled **Details, rules and questions**; submissions → the Submissions card; not-submitted → the Not submitted card with `MissingPanel … basePath={\`/admin/events/${ev.id}/activities/${activity.id}\`} tab="not-submitted"`; participation → the Participation card (only when `drifting`). Header switch and menu as in BookingDetail.
- [ ] **Step 5: `PassportDetail.tsx`** — accept `tab?: string` (unused: one tab, no strip), bind the switch with `"setup"`, set `settingsHref={activityHref(ev.id, activity.id)}`, and order the page Details form first (retitled **Details and rules**), then Booths, then the note paragraph. Keep the header's Add booth button.

- [ ] **Step 6: List page** — in `listItem`, `settingsHref: href` (Setup is the default) and every `toggleOpenAction.bind(null, ev.id, a.id, "list")` stays as is.

- [ ] **Step 7: Typecheck, lint, test**

Run: `npx tsc --noEmit -p . ; npx eslint "src/app/admin/events/[id]/activities" src/components/admin src/lib ; npx vitest run`
Expected: tsc exit 0, eslint exit 0, all tests pass.

- [ ] **Step 8: Browser check on the test event** (`/admin/events/4e64a90c-728c-4a08-af62-8c8046afa0c9/activities`): create a throwaway booking activity "ZZ Slots test"; Add sessions for two days 11:00–16:00, 15 minutes, break 13:00–14:00, 3 seats → the dialog says "Makes 32 sessions", the flash says "Added 32 sessions."; run it again → "Those sessions all exist already"; Delete day on one day → 16 left; edit one session's seats; switch every tab and reload on each (tab persists); open a submission activity's Not submitted tab, choose a day, confirm the tab stays. Then delete "ZZ Slots test". Check console for errors.

- [ ] **Step 9: Commit** (Tasks 4–6 together — they only compile together):

```bash
git add -A src/app/admin/events/[id]/activities src/components/admin src/lib/db/activities.ts
git commit -m "feat(activities): tabbed activity pages, bulk sessions by day, bookings view (D234–D242)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `QuestionCards` replaces `QuestionEditor`

**Files:**
- Create: `src/components/admin/QuestionCards.tsx`
- Modify: `src/components/admin/ActivityRows.tsx:9,60`
- Modify: `src/app/admin/events/[id]/settings/page.tsx:27,372`
- Delete: `src/components/admin/QuestionEditor.tsx`

**Interfaces:**
- Consumes: Task 3 (`draftFrom`, `keyFor`, `questionFormEntries`, `QuestionDraft`); `moveItem` (`src/lib/reorder.ts`)
- Produces: `QuestionCards({ questions, types, max }: { questions: RegistrationQuestion[]; types: readonly QuestionType[]; max: number })` — same props as `QuestionEditor`, so both call sites only swap the name.

- [ ] **Step 1: Write `QuestionCards.tsx`**:

```tsx
"use client";
import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { draftFrom, keyFor, questionFormEntries, type QuestionDraft } from "@/lib/questions-form";
import { moveItem } from "@/lib/reorder";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import type { QuestionType, RegistrationQuestion } from "@/lib/types";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const TYPE_LABELS: Record<QuestionType, string> = { text: "Text", phone: "Phone", number: "Number", select: "Choice", textarea: "Long text", file: "File" };

type Card = QuestionDraft & { id: number };
const blank = (): QuestionDraft => ({ key: "", label: "", type: "text", required: false, options: [], description: "", showKey: "", showValue: "" });

/**
 * The one question editor (D174, D243), for the registration form and for a submission
 * activity alike. Cards in on-screen order, one open at a time; keys never shown (D244);
 * a condition picks an earlier question by label (D245).
 *
 * Every field the server reads is a hidden input built by `questionFormEntries` from this
 * state, so the posted contract is the tested one (D247) and the visible controls carry no
 * names at all.
 */
export function QuestionCards({ questions, types, max }: {
  questions: RegistrationQuestion[];
  types: readonly QuestionType[];
  max: number;
}) {
  const nextId = useRef(questions.length);
  const [cards, setCards] = useState<Card[]>(() => questions.map((q, i) => ({ ...draftFrom(q), id: i })));
  const [open, setOpen] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const update = (id: number, patch: Partial<QuestionDraft>) => setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= cards.length) return;
    const moved = cards[from];
    const next = moveItem(cards, from, to);
    setCards(next);
    setMessage(`${moved.label || "Question"} moved to position ${to + 1} of ${next.length}`);
  };
  const add = () => {
    const id = nextId.current++;
    setCards((cs) => [...cs, { ...blank(), type: types[0], id }]);
    setOpen(id);
  };

  return (
    <div className="flex flex-col gap-2">
      {questionFormEntries(cards).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}

      {cards.length === 0 && <p className="text-sm text-muted-foreground">No questions yet.</p>}
      <ol className="flex flex-col gap-2">
        {cards.map((c, i) => {
          const expanded = open === c.id;
          const earlier = cards.slice(0, i).filter((e) => e.label.trim());
          const target = earlier.find((e) => keyFor(e.key || e.label) === c.showKey);
          const summary = [TYPE_LABELS[c.type], c.required ? "required" : null, c.showKey ? "conditional" : null].filter(Boolean).join(" · ");
          return (
            <li key={c.id} className={`rounded-lg border ${expanded ? "border-primary/50" : "border-border"}`}>
              <div className="flex items-center gap-1 px-2 py-1.5">
                <button type="button" aria-label={`Reorder ${c.label || `question ${i + 1}`}. Position ${i + 1} of ${cards.length}. Use the arrow keys to move it.`}
                  onKeyDown={(e) => { const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null; if (to === null) return; e.preventDefault(); move(i, to); }}
                  className="flex h-9 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-background">
                  <Icon name="grip" size={18} />
                </button>
                <button type="button" onClick={() => setOpen(expanded ? null : c.id)} aria-expanded={expanded}
                  className="flex min-w-0 flex-1 items-baseline gap-2 rounded-md px-1 py-1 text-left">
                  <span className="text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="truncate text-sm font-bold">{c.label || "Untitled question"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{summary}</span>
                </button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${c.label || "question"} up`} disabled={i === 0} onClick={() => move(i, i - 1)}><ChevronUp /></Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${c.label || "question"} down`} disabled={i === cards.length - 1} onClick={() => move(i, i + 1)}><ChevronDown /></Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${c.label || "question"}`} onClick={() => setCards((cs) => cs.filter((x) => x.id !== c.id))}><Trash2 /></Button>
              </div>

              {expanded && (
                <div className="grid gap-3 border-t border-border px-4 py-3">
                  <label className="grid gap-1.5 text-sm"><span className="font-bold">Question</span>
                    <input value={c.label} onChange={(e) => update(c.id, { label: e.target.value })} className={input} autoFocus /></label>
                  <div className="flex flex-wrap items-end gap-4">
                    <label className="grid gap-1.5 text-sm"><span className="font-bold">Type</span>
                      <select value={c.type} onChange={(e) => update(c.id, { type: e.target.value as QuestionType })} className={input}>
                        {types.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                      </select></label>
                    <label className="flex h-9 items-center gap-2 text-sm font-bold">
                      <input type="checkbox" checked={c.required} onChange={(e) => update(c.id, { required: e.target.checked })} className="size-4 accent-primary" />
                      Required
                    </label>
                  </div>
                  {c.type === "select" && (
                    <label className="grid gap-1.5 text-sm"><span className="font-bold">Choices</span>
                      <textarea rows={4} value={c.options.join("\n")} className={`${input} h-auto py-2`}
                        onChange={(e) => update(c.id, { options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
                      <span className="text-xs text-muted-foreground">One per line. A choice can’t contain a comma.</span></label>
                  )}
                  <label className="grid gap-1.5 text-sm"><span className="font-bold">Help text (optional)</span>
                    <input value={c.description} onChange={(e) => update(c.id, { description: e.target.value })} className={input} /></label>
                  <div className="grid gap-1.5 text-sm">
                    <span className="font-bold">Show only when</span>
                    <div className="flex flex-wrap gap-2">
                      <select aria-label="Depends on question" value={c.showKey} className={`${input} w-auto min-w-48 flex-1`}
                        onChange={(e) => update(c.id, { showKey: e.target.value, showValue: "" })}>
                        <option value="">Always show</option>
                        {earlier.map((e) => <option key={e.id} value={keyFor(e.key || e.label)}>{e.label}</option>)}
                      </select>
                      {c.showKey && (target?.type === "select" ? (
                        <select aria-label="Answer" value={c.showValue} onChange={(e) => update(c.id, { showValue: e.target.value })} className={`${input} w-auto min-w-40 flex-1`}>
                          <option value="">Pick an answer</option>
                          {target.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input aria-label="Answer contains" placeholder="answer contains…" value={c.showValue} onChange={(e) => update(c.id, { showValue: e.target.value })} className={`${input} w-auto min-w-40 flex-1`} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="sr-only" role="status" aria-live="polite">{message}</p>
      {cards.length < max
        ? <Button type="button" variant="outline" size="sm" className="w-fit" onClick={add}><Plus data-icon="inline-start" />Add question</Button>
        : <p className="text-xs text-muted-foreground">That’s the most questions this form can have ({max}).</p>}
    </div>
  );
}
```

- [ ] **Step 2: Swap the two call sites.** In `ActivityRows.tsx` and `settings/page.tsx` replace `import { QuestionEditor } from "@/components/admin/QuestionEditor"` with `import { QuestionCards } from "@/components/admin/QuestionCards"` and `<QuestionEditor` with `<QuestionCards` (props unchanged). `git rm src/components/admin/QuestionEditor.tsx`.

- [ ] **Step 3: Typecheck, lint, test**

Run: `npx tsc --noEmit -p . ; npx eslint src/components/admin/QuestionCards.tsx src/components/admin/ActivityRows.tsx "src/app/admin/events/[id]/settings/page.tsx" ; npx vitest run`
Expected: exit 0 / 0 / all pass.

- [ ] **Step 4: Browser check on the test event**: on a test submission activity, add three questions (Choice with two choices, Number shown only when the Choice is one of them, File), reorder them, remove one, Save, reload — order, choices and condition persist. On the test event's Settings → registration questions, relabel an existing question, Save, then confirm on the attendees table that its column still shows the stored answers (key unchanged). Remove the test questions afterwards.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/QuestionCards.tsx src/components/admin/ActivityRows.tsx "src/app/admin/events/[id]/settings/page.tsx"
git rm --cached src/components/admin/QuestionEditor.tsx 2>/dev/null; git add -A src/components/admin
git commit -m "feat(questions): question cards replace the question table in both editors (D243–D247)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Finish

- [ ] **Step 1:** Mark the spec `Status: built 2026-09-25` and commit it.
- [ ] **Step 2:** Full `npx tsc --noEmit -p .`, `npx vitest run`, and a last pass over each tab of each kind on the test event with the console open.
- [ ] **Step 3:** Push to `main` only once the user says so.
