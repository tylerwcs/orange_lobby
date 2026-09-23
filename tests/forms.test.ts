import { describe, expect, it } from "vitest";
import { canSubmit, capSummary, missingFrom, participation } from "@/lib/forms";
import type { Form, FormSubmission } from "@/lib/types";

const form = (over: Partial<Form> = {}): Form => ({
  id: "f1", org_id: "o", event_id: "e", name: "Daily check-in", description: null,
  questions: [], submissions_open: true, categories: null,
  max_per_attendee: null, per_day: false, sort_order: 0, created_at: "2026-09-01T00:00:00Z", ...over,
});
const sub = (day: string): FormSubmission => ({
  id: `s-${day}`, event_id: "e", form_id: "f1", attendee_id: "a1", answers: {},
  submitted_on: day, status: "submitted", per_day: true, created_at: `${day}T01:00:00Z`,
});
const TODAY = "2026-09-28";

describe("canSubmit", () => {
  it("lets an eligible attendee submit to an open form", () => {
    expect(canSubmit(form(), [], null, TODAY)).toEqual({ can: true, reason: "ok", used: 0 });
  });

  it("refuses a closed form", () => {
    expect(canSubmit(form({ submissions_open: false }), [], null, TODAY).reason).toBe("closed");
  });

  it("refuses an attendee outside the form's categories", () => {
    expect(canSubmit(form({ categories: ["VIP"] }), [], "Delegate", TODAY).reason).toBe("ineligible");
  });

  it("lets a matching category in, ignoring case and spaces", () => {
    expect(canSubmit(form({ categories: ["VIP"] }), [], " vip ", TODAY).can).toBe(true);
  });

  it("treats no categories as everyone", () => {
    expect(canSubmit(form({ categories: [] }), [], null, TODAY).can).toBe(true);
  });

  it("refuses once the total cap is reached", () => {
    const r = canSubmit(form({ max_per_attendee: 2 }), [sub("2026-09-26"), sub("2026-09-27")], null, TODAY);
    expect(r).toEqual({ can: false, reason: "limit", used: 2 });
  });

  it("allows the last one under the cap", () => {
    expect(canSubmit(form({ max_per_attendee: 2 }), [sub("2026-09-26")], null, TODAY).can).toBe(true);
  });

  // D171: per_day is a second dial, not a scoping of the cap.
  it("refuses a second submission on the same day to a per_day form", () => {
    const r = canSubmit(form({ per_day: true }), [sub(TODAY)], null, TODAY);
    expect(r).toEqual({ can: false, reason: "today", used: 1 });
  });

  it("allows tomorrow's submission to a per_day form", () => {
    expect(canSubmit(form({ per_day: true }), [sub("2026-09-27")], null, TODAY).can).toBe(true);
  });

  it("applies the total cap to a per_day form as well", () => {
    const r = canSubmit(form({ per_day: true, max_per_attendee: 2 }), [sub("2026-09-26"), sub("2026-09-27")], null, TODAY);
    expect(r.reason).toBe("limit");
  });

  // Closed beats everything: an organiser who shut the form is not asking about caps.
  it("reports closed before any other reason", () => {
    const r = canSubmit(form({ submissions_open: false, categories: ["VIP"] }), [sub(TODAY)], "Delegate", TODAY);
    expect(r.reason).toBe("closed");
  });
});

describe("capSummary", () => {
  it("says unlimited when there is no cap and no daily rule", () => {
    expect(capSummary(form())).toBe("Unlimited");
  });
  it("says once a day for a per_day form with no total", () => {
    expect(capSummary(form({ per_day: true }))).toBe("Once a day");
  });
  it("names both dials when a per_day form also has a total", () => {
    expect(capSummary(form({ per_day: true, max_per_attendee: 5 }))).toBe("Once a day, up to 5");
  });
  it("says once for a form capped at one", () => {
    expect(capSummary(form({ max_per_attendee: 1 }))).toBe("Once");
  });
  it("names the total for a capped form", () => {
    expect(capSummary(form({ max_per_attendee: 5 }))).toBe("Up to 5");
  });
});

/**
 * The chasing list. Mirrors `unbookedByActivity` for activities, with one dimension that
 * has no equivalent there: a daily form's answer depends on WHICH day you ask about.
 */
describe("missingFrom", () => {
  const by = (id: string) => (id === "vip" ? "VIP" : "Delegate");
  const subFor = (attendee_id: string, day: string): FormSubmission =>
    ({ ...sub(day), id: `${attendee_id}-${day}`, attendee_id });

  it("lists everyone when nobody has submitted", () => {
    expect(missingFrom(form(), [], ["a1", "a2"], () => null, null)).toEqual(["a1", "a2"]);
  });

  it("leaves out whoever has submitted", () => {
    expect(missingFrom(form(), [subFor("a1", TODAY)], ["a1", "a2"], () => null, null)).toEqual(["a2"]);
  });

  it("keeps the order it was given, so the list reads top to bottom", () => {
    expect(missingFrom(form(), [], ["c", "a", "b"], () => null, null)).toEqual(["c", "a", "b"]);
  });

  it("leaves out attendees the form's categories exclude", () => {
    expect(missingFrom(form({ categories: ["VIP"] }), [], ["vip", "other"], by, null)).toEqual(["vip"]);
  });

  it("treats no categories as everyone", () => {
    expect(missingFrom(form({ categories: [] }), [], ["vip", "other"], by, null)).toEqual(["vip", "other"]);
  });

  // The whole point of the day argument: yesterday's check-in does not answer for today.
  it("counts someone who submitted on a DIFFERENT day as missing today", () => {
    expect(missingFrom(form({ per_day: true }), [subFor("a1", "2026-09-27")], ["a1"], () => null, TODAY)).toEqual(["a1"]);
  });

  it("leaves out someone who submitted on the day asked about", () => {
    expect(missingFrom(form({ per_day: true }), [subFor("a1", TODAY)], ["a1"], () => null, TODAY)).toEqual([]);
  });

  // A null day is "has never submitted", which is what a once-only form means.
  it("accepts any day's submission when asked about no day in particular", () => {
    expect(missingFrom(form(), [subFor("a1", "2026-01-01")], ["a1"], () => null, null)).toEqual([]);
  });

  it("ignores submissions belonging to another form", () => {
    const other = { ...subFor("a1", TODAY), form_id: "f2" };
    expect(missingFrom(form(), [other], ["a1"], () => null, null)).toEqual(["a1"]);
  });

  it("returns nothing for an event with no attendees, rather than throwing", () => {
    expect(missingFrom(form(), [], [], () => null, null)).toEqual([]);
  });
});

/**
 * Who is drifting. The ordering IS the feature — an alphabetical list would bury the one
 * person who submitted every day until Tuesday and then stopped.
 */
describe("participation", () => {
  const on = (attendee_id: string, day: string): FormSubmission =>
    ({ ...sub(day), id: `${attendee_id}-${day}`, attendee_id });
  const ids = (rows: ReturnType<typeof participation>) => rows.map((r) => r.attendeeId);

  it("draws one cell per day in the window, oldest first", () => {
    const [row] = participation(form(), [], ["a1"], () => null, TODAY, 3);
    expect(row.days.map((d) => d.day)).toEqual(["2026-09-26", "2026-09-27", "2026-09-28"]);
    expect(row.days.every((d) => !d.submitted)).toBe(true);
  });

  it("marks the days they submitted on", () => {
    const [row] = participation(form(), [on("a1", "2026-09-27")], ["a1"], () => null, TODAY, 3);
    expect(row.days.map((d) => d.submitted)).toEqual([false, true, false]);
    expect(row.count).toBe(1);
  });

  it("counts only days inside the window", () => {
    const subs = [on("a1", "2026-09-01"), on("a1", TODAY)];
    expect(participation(form(), subs, ["a1"], () => null, TODAY, 3)[0].count).toBe(1);
  });

  // The gap is measured from their LAST submission ever, not from the window's edge:
  // somebody who stopped a month ago is more adrift than somebody who stopped last week.
  it("measures the gap from their last submission even when it predates the window", () => {
    const [row] = participation(form(), [on("a1", "2026-09-18")], ["a1"], () => null, TODAY, 3);
    expect(row.lastDay).toBe("2026-09-18");
    expect(row.daysSince).toBe(10);
    expect(row.count).toBe(0);
  });

  it("reports no last day and no gap for somebody who never submitted", () => {
    const [row] = participation(form(), [], ["a1"], () => null, TODAY, 3);
    expect(row.lastDay).toBeNull();
    expect(row.daysSince).toBeNull();
  });

  it("puts the longest gap first among people who have submitted", () => {
    const subs = [on("recent", TODAY), on("lapsed", "2026-09-20"), on("middling", "2026-09-25")];
    expect(ids(participation(form(), subs, ["recent", "middling", "lapsed"], () => null, TODAY, 14)))
      .toEqual(["lapsed", "middling", "recent"]);
  });

  // The deviation that matters: on a young form almost nobody has submitted, and sorting
  // "never" as the largest gap would bury the actual drifter under everyone who never began.
  it("puts everyone who has submitted above everyone who never has", () => {
    const subs = [on("lapsed", "2026-09-01")];
    expect(ids(participation(form(), subs, ["never1", "never2", "lapsed"], () => null, TODAY, 14)))
      .toEqual(["lapsed", "never1", "never2"]);
  });

  it("keeps the given order among people who have never submitted", () => {
    expect(ids(participation(form(), [], ["c", "a", "b"], () => null, TODAY, 14))).toEqual(["c", "a", "b"]);
  });

  it("leaves out attendees the form's categories exclude", () => {
    const by = (id: string) => (id === "vip" ? "VIP" : "Delegate");
    expect(ids(participation(form({ categories: ["VIP"] }), [], ["vip", "other"], by, TODAY, 14))).toEqual(["vip"]);
  });

  it("ignores submissions belonging to another form", () => {
    const other = { ...on("a1", TODAY), form_id: "f2" };
    expect(participation(form(), [other], ["a1"], () => null, TODAY, 14)[0].count).toBe(0);
  });

  it("counts a day once even if the form allowed two submissions on it", () => {
    const twice = [on("a1", TODAY), { ...on("a1", TODAY), id: "second" }];
    const [row] = participation(form(), twice, ["a1"], () => null, TODAY, 3);
    expect(row.count).toBe(1);
  });
});
