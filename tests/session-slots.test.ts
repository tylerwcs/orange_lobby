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
