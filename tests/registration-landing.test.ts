import { describe, it, expect } from "vitest";
import { resolveTokenView, registerLanding, bookableAfterRegister } from "@/features/registration-queue/lib/landing";
import type { RegistrationEntryState } from "@/lib/types";

const active = { id: "a1", cancelled_at: null as string | null };
const cancelled = { id: "a1", cancelled_at: "2026-10-01T00:00:00Z" as string | null };
const entry = (state: RegistrationEntryState) => ({ id: "e1", state });

describe("resolveTokenView (D689, D695)", () => {
  it("gives an active attendee the portal, whatever entry shares the token", () => {
    expect(resolveTokenView(active, null)).toEqual({ kind: "portal", attendee: active });
    expect(resolveTokenView(active, entry("registered")).kind).toBe("portal");
    expect(resolveTokenView(active, entry("waiting")).kind).toBe("portal");
  });

  it("gives an entry in a queue state the queue card", () => {
    for (const s of ["waiting", "pending", "declined", "left", "removed"] as const) {
      expect(resolveTokenView(null, entry(s))).toEqual({ kind: "queue", entry: entry(s) });
    }
  });

  it("puts the entry before the cancelled card when a returning person shares the token", () => {
    expect(resolveTokenView(cancelled, entry("waiting")).kind).toBe("queue");
    expect(resolveTokenView(cancelled, entry("left")).kind).toBe("queue");
  });

  it("falls back to the cancelled card for a registered entry or none", () => {
    expect(resolveTokenView(cancelled, entry("registered"))).toEqual({ kind: "cancelled", attendee: cancelled });
    expect(resolveTokenView(cancelled, null).kind).toBe("cancelled");
  });

  it("is missing with neither, or only a registered entry", () => {
    expect(resolveTokenView(null, null)).toEqual({ kind: "missing" });
    expect(resolveTokenView(null, entry("registered"))).toEqual({ kind: "missing" });
  });
});

describe("registerLanding (D634, D690, D695)", () => {
  it("sends registered and updated people where they went before", () => {
    for (const o of ["registered", "updated"] as const) {
      expect(registerLanding(o, { showsDone: true, waitlistForm: false })).toEqual({ to: "done" });
      expect(registerLanding(o, { showsDone: false, waitlistForm: false })).toEqual({ to: "link", filled: false });
      expect(registerLanding(o, { showsDone: true, waitlistForm: true })).toEqual({ to: "done" });
    }
  });

  it("never shows the done page to someone waiting or pending", () => {
    expect(registerLanding("waiting", { showsDone: true, waitlistForm: true })).toEqual({ to: "link", filled: false });
    expect(registerLanding("pending", { showsDone: true, waitlistForm: false })).toEqual({ to: "link", filled: false });
  });

  it("says the event filled up only when the normal form landed on the waiting list", () => {
    expect(registerLanding("waiting", { showsDone: false, waitlistForm: false })).toEqual({ to: "link", filled: true });
    expect(registerLanding("waiting", { showsDone: false, waitlistForm: true })).toEqual({ to: "link", filled: false });
  });
});

describe("registerLanding with a booking to open (D766)", () => {
  it("sends registered and updated people to the booking, ahead of the You're in page", () => {
    for (const o of ["registered", "updated"] as const) {
      expect(registerLanding(o, { showsDone: true, waitlistForm: false, booking: "act1" })).toEqual({ to: "activity", id: "act1" });
      expect(registerLanding(o, { showsDone: false, waitlistForm: false, booking: "act1" })).toEqual({ to: "activity", id: "act1" });
    }
  });
  it("never sends someone waiting or pending to it - they can't book yet", () => {
    expect(registerLanding("waiting", { showsDone: false, waitlistForm: false, booking: "act1" })).toEqual({ to: "link", filled: true });
    expect(registerLanding("pending", { showsDone: false, waitlistForm: false, booking: "act1" })).toEqual({ to: "link", filled: false });
  });
  it("lands as before when there is no booking to open", () => {
    expect(registerLanding("registered", { showsDone: false, waitlistForm: false, booking: null })).toEqual({ to: "link", filled: false });
  });
});

describe("bookableAfterRegister (D766)", () => {
  const now = { date: "2026-11-01", time: "10:00" };
  const activity = { id: "act1", kind: "booking" as const, is_open: true, categories: null as string[] | null };
  const session = (id: string, day: string, starts_at: string, capacity = 1) =>
    ({ id, event_id: "e1", activity_id: "act1", day, starts_at, ends_at: null, location: null, capacity, sort_order: 0 });
  const later = [session("s1", "2026-11-06", "09:00")];

  it("opens a booking that is open, theirs to book, and has a slot with room still to come", () => {
    expect(bookableAfterRegister({ activity, sessions: later, counts: {}, category: null, now })).toBe(true);
  });
  it("falls back for a closed booking, or one that isn't a booking", () => {
    expect(bookableAfterRegister({ activity: { ...activity, is_open: false }, sessions: later, counts: {}, category: null, now })).toBe(false);
    expect(bookableAfterRegister({ activity: { ...activity, kind: "submission" as const }, sessions: later, counts: {}, category: null, now })).toBe(false);
  });
  it("falls back when it isn't open to their category", () => {
    expect(bookableAfterRegister({ activity: { ...activity, categories: ["VIP"] }, sessions: later, counts: {}, category: null, now })).toBe(false);
  });
  it("falls back when every slot is full or already started", () => {
    expect(bookableAfterRegister({ activity, sessions: later, counts: { s1: 1 }, category: null, now })).toBe(false);
    expect(bookableAfterRegister({ activity, sessions: [session("s2", "2026-11-01", "09:30")], counts: {}, category: null, now })).toBe(false);
    expect(bookableAfterRegister({ activity, sessions: [], counts: {}, category: null, now })).toBe(false);
  });
});
