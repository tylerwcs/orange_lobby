import { describe, expect, it } from "vitest";
import { spotlightMs, splitQueue, arrivals, pruneQueue } from "@/features/polaroid/lib/spotlight";

const NOW = Date.parse("2026-10-11T10:00:00Z");
const card = (id: string, secondsAgo = 1) => ({ id, created_at: new Date(NOW - secondsAgo * 1000).toISOString() });

describe("spotlight (D484)", () => {
  it("lasts 6 s, or 3 s while more than 5 wait", () => {
    expect(spotlightMs(0)).toBe(6000);
    expect(spotlightMs(5)).toBe(6000);
    expect(spotlightMs(6)).toBe(3000);
  });
  it("keeps 15 in the queue and sends the rest straight to the columns", () => {
    const q = Array.from({ length: 20 }, (_, i) => i);
    expect(splitQueue(q)).toEqual({ spotlight: q.slice(0, 15), direct: q.slice(15) });
  });
  it("spotlights nothing on the first load", () => {
    expect(arrivals(null, [card("a")], NOW)).toEqual([]);
  });
  it("spotlights only new, recent cards", () => {
    expect(arrivals(new Set(["a"]), [card("a"), card("b"), card("c", 120)], NOW).map((c) => c.id)).toEqual(["b"]);
  });
  it("drops a queued card that was taken down (Review Focus 2)", () => {
    expect(pruneQueue([card("a"), card("b")], new Set(["b"])).map((c) => c.id)).toEqual(["b"]);
  });
});
