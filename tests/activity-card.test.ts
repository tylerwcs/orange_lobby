import { describe, it, expect } from "vitest";
import { bookingCard, dayRange, formCard, type BookingCardInput } from "@/lib/activity-card";
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
  const form = (max_per_attendee: number | null = 1, per_day = false) => ({ max_per_attendee, per_day });
  it("invites a first answer, counting against the cap", () => {
    expect(formCard({ form: form(), state: { can: true, reason: "ok", used: 0 } })).toEqual({
      status: { label: "Open", tone: "primary" },
      meta: { icon: "send", text: "0 of 1 sent" },
      action: { label: "Fill in", primary: true },
    });
  });
  it("counts without a cap", () => {
    expect(formCard({ form: form(null), state: { can: true, reason: "ok", used: 2 } }).meta).toEqual({ icon: "send", text: "2 sent" });
  });
  it("says a daily form is once a day before anything is sent", () => {
    expect(formCard({ form: form(null, true), state: { can: true, reason: "ok", used: 0 } }).meta).toEqual({ icon: "send", text: "Once a day" });
  });
  it("shows a finished form as sent", () => {
    expect(formCard({ form: form(), state: { can: false, reason: "limit", used: 1 } })).toEqual({
      status: { label: "Sent", tone: "success" },
      meta: { icon: "send", text: "1 of 1 sent" },
      action: { label: "View", primary: false },
    });
  });
  it("tells a daily form to come back tomorrow", () => {
    expect(formCard({ form: form(null, true), state: { can: false, reason: "today", used: 3 } })).toEqual({
      status: { label: "Sent today", tone: "success" },
      meta: { icon: "clock", text: "Come back tomorrow" },
      action: { label: "View", primary: false },
    });
  });
  it("marks a closed form", () => {
    expect(formCard({ form: form(), state: { can: false, reason: "closed", used: 0 } }).status).toEqual({ label: "Closed", tone: "muted" });
  });
});
