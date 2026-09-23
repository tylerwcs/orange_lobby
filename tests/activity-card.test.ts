import { describe, it, expect } from "vitest";
import { bookingCard, dayRange, formCard, type BookingCardInput, type FormCardInput } from "@/lib/activity-card";
import type { SeatsForViewer } from "@/lib/activities";

const seat = (day: string, starts_at: string, left: number, mine = false, location: string | null = "Gardensby17"): SeatsForViewer => ({
  session: { id: `${day}-${starts_at}`, event_id: "e", activity_id: "a", day, starts_at, ends_at: null, location, capacity: 5, sort_order: 0 } as SeatsForViewer["session"],
  booked: 5 - left, left, full: left === 0, mine,
});
const booking = (over: Partial<BookingCardInput["state"]> = {}, pending = false): BookingCardInput => ({
  state: { sessions: [seat("2026-09-28", "12:00", 3), seat("2026-10-02", "09:00", 2)], closed: false, mustPick: false, held: 0, ...over },
  pending,
});

describe("dayRange", () => {
  it("names one day in full", () => {
    expect(dayRange(["2026-09-28"])).toBe("Mon 28 Sep");
  });
  it("keeps one month once when the days share it", () => {
    expect(dayRange(["2026-09-30", "2026-09-28"])).toBe("28 – 30 Sep");
  });
  it("names both months when the range crosses one", () => {
    expect(dayRange(["2026-09-28", "2026-10-02", "2026-09-29"])).toBe("28 Sep – 2 Oct");
  });
  it("has nothing to say about no days", () => {
    expect(dayRange([])).toBeNull();
  });
});

describe("bookingCard", () => {
  it("offers Book with the dates and seats left when nothing is held", () => {
    expect(bookingCard(booking())).toEqual({
      status: null,
      meta: { icon: "calendar", text: "28 Sep – 2 Oct · 5 seats left" },
      action: { label: "Book", primary: true },
    });
  });
  it("asks for a choice on a required activity with nothing held", () => {
    expect(bookingCard(booking({ mustPick: true }))).toEqual({
      status: { label: "Pick one", tone: "primary" },
      meta: { icon: "calendar", text: "28 Sep – 2 Oct · 5 seats left" },
      action: { label: "Choose", primary: true },
    });
  });
  it("shows the booked slot once something is held", () => {
    const b = booking({ held: 1, sessions: [seat("2026-09-28", "12:30", 3, true), seat("2026-09-29", "09:00", 1)] });
    expect(bookingCard(b)).toEqual({
      status: { label: "Booked", tone: "success" },
      meta: { icon: "calendar", text: "Mon 28 Sep · 12:30 · Gardensby17" },
      action: { label: "View", primary: false },
    });
  });
  it("says a change is waiting before anything else", () => {
    const b = booking({ held: 1, sessions: [seat("2026-09-28", "12:30", 3, true)] }, true);
    expect(bookingCard(b).status).toEqual({ label: "Waiting for the desk", tone: "warning" });
  });
  it("marks a closed activity and points at the desk", () => {
    expect(bookingCard(booking({ closed: true }))).toEqual({
      status: { label: "Closed", tone: "muted" },
      meta: { icon: "calendar", text: "28 Sep – 2 Oct" },
      action: { label: "View", primary: false },
    });
  });
  it("marks an activity with no seats left as full", () => {
    const b = booking({ sessions: [seat("2026-09-28", "12:00", 0)] });
    expect(bookingCard(b).status).toEqual({ label: "Full", tone: "muted" });
    expect(bookingCard(b).action).toEqual({ label: "View", primary: false });
  });
  it("still has a card for an activity with no sessions yet", () => {
    expect(bookingCard(booking({ sessions: [] }))).toEqual({
      status: null,
      meta: { icon: "clock", text: "Sessions coming soon" },
      action: { label: "View", primary: false },
    });
  });
});

describe("formCard", () => {
  const form = (over: Partial<FormCardInput["form"]> = {}): FormCardInput["form"] =>
    ({ starts_on: "2026-09-28", ends_on: "2026-10-02", venue: "Level 3 gym", action_label: null, ...over });
  const open = { can: true, reason: "ok" as const, used: 0 };

  it("invites a first answer with the dates and place, under the organiser's button wording", () => {
    expect(formCard({ form: form({ action_label: "Join now" }), state: open })).toEqual({
      status: { label: "Open", tone: "primary" },
      meta: { icon: "calendar", text: "28 Sep – 2 Oct · Level 3 gym" },
      action: { label: "Join now", primary: true },
    });
  });
  it("says Submit when the organiser chose no wording", () => {
    expect(formCard({ form: form(), state: open }).action).toEqual({ label: "Submit", primary: true });
  });
  it("shows the place alone when there are no dates, and nothing when there is neither", () => {
    expect(formCard({ form: form({ starts_on: null, ends_on: null }), state: open }).meta).toEqual({ icon: "pin", text: "Level 3 gym" });
    expect(formCard({ form: form({ starts_on: null, ends_on: null, venue: null }), state: open }).meta).toBeNull();
  });
  it("names a single day in full", () => {
    expect(formCard({ form: form({ ends_on: null, venue: null }), state: open }).meta).toEqual({ icon: "calendar", text: "Mon 28 Sep" });
  });
  it("marks a finished submission as done", () => {
    expect(formCard({ form: form(), state: { can: false, reason: "limit", used: 1 } })).toMatchObject({
      status: { label: "Submission done", tone: "success" },
      action: { label: "View", primary: false },
    });
  });
  it("marks a daily one as done for today", () => {
    expect(formCard({ form: form(), state: { can: false, reason: "today", used: 3 } }).status).toEqual({ label: "Done for today", tone: "success" });
  });
  it("marks a closed one", () => {
    expect(formCard({ form: form(), state: { can: false, reason: "closed", used: 0 } }).status).toEqual({ label: "Closed", tone: "muted" });
  });
});
