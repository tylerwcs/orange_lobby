import { describe, it, expect } from "vitest";
import { isSession, byAgendaOrder, firstLater, timeSlot } from "@/lib/agenda-order";
import type { AgendaItem } from "@/lib/types";

const mk = (p: Partial<AgendaItem>): AgendaItem => ({
  id: "x", event_id: "e", day_id: "d1", day: "2026-09-30", kind: "session", starts_at: "09:00", ends_at: null,
  title: "t", description: null, location: null, categories: null, slot: null, code: null, color: null,
  image_url: null, sort_order: 0, ...p,
});
const img = (p: Partial<AgendaItem>) => mk({ kind: "image", starts_at: null, image_url: "https://x/y.png", ...p });

describe("isSession", () => {
  it("is true for a session with a time and false for an image", () => {
    expect(isSession(mk({}))).toBe(true);
    expect(isSession(img({}))).toBe(false);
  });
});

describe("byAgendaOrder", () => {
  it("orders by day, then the organiser's order - never by time", () => {
    const rows = [
      mk({ id: "late-day", day: "2026-10-01", sort_order: 10 }),
      mk({ id: "b", starts_at: "08:00", sort_order: 20 }),
      mk({ id: "a", starts_at: "17:00", sort_order: 10 }),
    ];
    expect([...rows].sort(byAgendaOrder).map((r) => r.id)).toEqual(["a", "b", "late-day"]);
  });
});

describe("firstLater", () => {
  const t = (s: string | null) => s;
  it("finds the first entry that starts strictly later", () => {
    expect(firstLater(["09:00", "10:00", "12:00"], "10:00", t)).toBe(2);
  });
  it("skips entries with no time", () => {
    expect(firstLater(["09:00", null, "12:00"], "10:00", t)).toBe(2);
  });
  it("is the length when nothing starts later", () => {
    expect(firstLater(["09:00", null], "23:00", t)).toBe(2);
  });
});

describe("timeSlot", () => {
  const rows = [
    mk({ id: "a", day: "2026-09-30", starts_at: "09:00" }),
    img({ id: "i", day: "2026-09-30" }),
    mk({ id: "b", day: "2026-09-30", starts_at: "14:00" }),
    mk({ id: "c", day: "2026-10-02", starts_at: "09:00" }),
  ];
  const at = (day: string, time: string) => timeSlot(rows, day, time, (r) => r.day, (r) => (isSession(r) ? r.starts_at : null));
  it("goes before the first later row of its own day, after any image before it", () => {
    expect(at("2026-09-30", "11:00")).toBe(2);
  });
  it("goes at the end of its day when nothing there starts later", () => {
    expect(at("2026-09-30", "18:00")).toBe(3);
  });
  it("goes between days when its day has no rows", () => {
    expect(at("2026-10-01", "10:00")).toBe(3);
  });
  it("goes at the very end after the last day", () => {
    expect(at("2026-10-05", "10:00")).toBe(4);
  });
});
