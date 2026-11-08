import { describe, expect, it } from "vitest";
import { liveStart, liveStep, isLanded, wantsRefresh } from "@/features/activities/lib/passport-live";
import type { Reveal } from "@/features/activities/lib/booths";

const rev = (boothId: string, stampedAt = "2026-11-08T11:00:00Z"): Reveal => ({ stampId: `${boothId}-s`, boothId, name: boothId, image: null, stampedAt });

describe("passport live queue", () => {
  it("starts with the unseen stamps queued and nothing landed", () => {
    const s = liveStart([rev("b1"), rev("b2")]);
    expect(s.queue.map((r) => r.boothId)).toEqual(["b1", "b2"]);
    expect(isLanded(s, "b1")).toBe(false);
  });

  it("adds arrivals once each", () => {
    const s = liveStep(liveStep(liveStart([]), { type: "arrived", reveals: [rev("b1")] }), { type: "arrived", reveals: [rev("b1"), rev("b2")] });
    expect(s.queue.map((r) => r.boothId)).toEqual(["b1", "b2"]);
  });

  // Review fix 1: a landed stamp reads as stamped while the rest of the queue plays, in either look.
  it("holds a landed stamp while the queue still plays", () => {
    const s = liveStep(liveStart([rev("b1"), rev("b2")]), { type: "landed", reveal: rev("b1") });
    expect(isLanded(s, "b1")).toBe(true);
    expect(s.queue.map((r) => r.boothId)).toEqual(["b2"]);
    expect(wantsRefresh(s)).toBe(false);
  });

  it("asks for a refresh once the queue is empty", () => {
    const s = liveStep(liveStart([rev("b1")]), { type: "landed", reveal: rev("b1") });
    expect(wantsRefresh(s)).toBe(true);
  });

  // Review fix 2: once the refreshed grid is in, the server's word stands - an undone stamp reads "?" again.
  it("lets go of landed stamps when the refresh has arrived", () => {
    const landed = liveStep(liveStart([rev("b1")]), { type: "landed", reveal: rev("b1") });
    const s = liveStep(landed, { type: "refreshed" });
    expect(isLanded(s, "b1")).toBe(false);
    expect(wantsRefresh(s)).toBe(false);
  });

  // A stamp that arrives while the refresh is out keeps its hold through that refresh.
  it("keeps a hold that landed after the refresh was asked for", () => {
    let s = liveStep(liveStart([rev("b1")]), { type: "landed", reveal: rev("b1") });
    s = liveStep(s, { type: "refreshing" });
    s = liveStep(s, { type: "arrived", reveals: [rev("b2", "2026-11-08T12:00:00Z")] });
    s = liveStep(s, { type: "landed", reveal: rev("b2", "2026-11-08T12:00:00Z") });
    s = liveStep(s, { type: "refreshed" });
    expect(isLanded(s, "b1")).toBe(false);
    expect(isLanded(s, "b2")).toBe(true);
    expect(wantsRefresh(s)).toBe(true);
  });
});
