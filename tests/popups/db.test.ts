import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** PostgREST hands back at most 1,000 rows unless the read pages with range() (D289). */
const CAP = 1000;
const bookings = Array.from({ length: 1005 }, (_, i) => ({ id: `b${String(i).padStart(4, "0")}`, session_id: "s1", activity_id: "a1" }));
const sessions = Array.from({ length: 1003 }, (_, i) => ({ id: `s${i}`, activity_id: "a1", day: "2026-11-06", starts_at: "10:00:00", ends_at: null, capacity: 1 }));

function table(rows: Record<string, unknown>[]) {
  let range: [number, number] | null = null;
  const builder = {
    select: () => builder,
    in: () => builder,
    order: () => builder,
    range: (from: number, to: number) => { range = [from, to]; return builder; },
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: range ? rows.slice(range[0], range[1] + 1) : rows.slice(0, CAP), error: null }),
  };
  return builder;
}

vi.mock("@/lib/supabase/service", () => ({
  serviceClient: () => ({ from: (name: string) => table(name === "activity_bookings" ? bookings : sessions) }),
}));

import { bookingCountsForActivities, sessionsForActivities } from "@/features/popups/db";

describe("popup reads past 1,000 rows", () => {
  it("counts every booking, not the first page", async () => {
    expect((await bookingCountsForActivities(["a1"])).s1).toBe(1005);
  });

  it("reads every session, not the first page", async () => {
    expect(await sessionsForActivities(["a1"])).toHaveLength(1003);
  });
});
