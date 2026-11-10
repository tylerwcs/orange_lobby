import { describe, expect, it } from "vitest";
import { bookStart, bookStep, heldReveals, type BookFlow } from "@/features/activities/kinds/passport/book/flow";
import { answerAt, answerBox, PAGE } from "@/features/activities/kinds/passport/book/geometry";
import { stampSpot } from "@/features/activities/kinds/passport/book/stamp-spots";
import { fitText } from "@/features/activities/kinds/passport/book/fit";
import { sceneArt, SCENE_TINTS } from "@/features/activities/kinds/passport/book/paint";
import { buildPassport } from "@/features/activities/lib/booths";
import type { Booth, BoothStamp } from "@/lib/types";

describe("bookStart", () => {
  it("goes straight to the finished passport once there is a result", () => {
    expect(bookStart({ testOn: true, questions: 10, hasResult: true, isOpen: false }).stage).toBe("done");
  });

  it("keeps a closed passport's test shut", () => {
    const f = bookStart({ testOn: true, questions: 10, hasResult: false, isOpen: false });
    expect(f.stage).toBe("locked");
    expect(f.closedMessage).toBe("Your passport opens at the event");
  });

  it("starts an open test on the closed cover", () => {
    expect(bookStart({ testOn: true, questions: 10, hasResult: false, isOpen: true }).stage).toBe("closed");
  });

  it("opens a passport without a test straight to the finished pages", () => {
    const f = bookStart({ testOn: false, questions: 0, hasResult: false, isOpen: true });
    expect(f.stage).toBe("closed");
    expect(bookStep(f, { type: "open" }).stage).toBe("done");
  });
});

describe("bookStep", () => {
  const start = bookStep(bookStart({ testOn: true, questions: 10, hasResult: false, isOpen: true }), { type: "open" });
  const pickN = (f: BookFlow, n: number) => Array.from({ length: n }).reduce<BookFlow>((acc, _, i) => bookStep(acc, { type: "pick", answerId: `a${i}` }), f);

  it("opens on the first question", () => {
    expect([start.stage, start.index]).toEqual(["questions", 0]);
  });

  it("stores a pick and turns the page", () => {
    const f = bookStep(start, { type: "pick", answerId: "a0" });
    expect([f.index, f.picks[0]]).toEqual([1, "a0"]);
  });

  it("goes back a page keeping the earlier pick", () => {
    const f = bookStep(pickN(start, 3), { type: "back" });
    expect([f.index, f.picks[2]]).toEqual([2, "a2"]);
  });

  it("can't close the cover again", () => {
    expect(bookStep(start, { type: "back" })).toEqual(start);
  });

  it("goes to the name page after the last question, and back", () => {
    const named = pickN(start, 10);
    expect(named.stage).toBe("name");
    expect(bookStep(named, { type: "back" })).toMatchObject({ stage: "questions", index: 9 });
  });

  it("finishes once revealed", () => {
    const named = pickN(start, 10);
    expect(bookStep(bookStep(named, { type: "reveal" }), { type: "revealed" }).stage).toBe("done");
  });

  it("shuts mid-test when the passport closes", () => {
    for (const f of [pickN(start, 4), pickN(start, 10)]) {
      expect(bookStep(f, { type: "closed" })).toMatchObject({ stage: "locked", closedMessage: "The passport has closed" });
    }
  });
});

describe("heldReveals", () => {
  const booth = (id: string): Booth => ({ id, org_id: "o", event_id: "e", activity_id: "p1", name: id, location: null, location_url: null, token: `t${id}`, sort_order: 0, stamp_image_url: null });
  const stamp = (b: string, at: string): BoothStamp => ({ id: `s${b}`, org_id: "o", event_id: "e", booth_id: b, attendee_id: "me", stamped_at: at, seen_at: null });
  const passport = buildPassport([booth("b1"), booth("b2")], [stamp("b2", "2026-11-10T02:00:00Z"), stamp("b1", "2026-11-10T01:00:00Z")], null);

  it("holds stamps given before the test until it is done", () => {
    const r = heldReveals(passport, { testOn: true, hasResult: false, preview: false });
    expect(r.now).toEqual([]);
    expect(r.afterTest.map((x) => x.boothId)).toEqual(["b1", "b2"]);
  });

  it("plays them at once when the test is done", () => {
    const r = heldReveals(passport, { testOn: true, hasResult: true, preview: false });
    expect(r.now.map((x) => x.boothId)).toEqual(["b1", "b2"]);
    expect(r.afterTest).toEqual([]);
  });

  it("plays nothing in a draft preview", () => {
    expect(heldReveals(passport, { testOn: true, hasResult: false, preview: true })).toEqual({ now: [], afterTest: [] });
  });
});

describe("answer rows", () => {
  it("are the four pill rows of the question page", () => {
    expect(answerBox(0)).toEqual({ x: 50, y: 232, w: 924, h: 104 });
    expect(answerBox(3).y).toBe(232 + 3 * 118);
  });

  it("finds the row under a tap", () => {
    expect(answerAt(0.5, 1 - (232 + 50) / PAGE.h)).toBe(0);
    expect(answerAt(0.5, 1 - (232 + 3 * 118 + 50) / PAGE.h)).toBe(3);
  });

  it("finds nothing between rows or above them", () => {
    expect(answerAt(0.5, 1 - 460 / PAGE.h)).toBeNull();
    expect(answerAt(0.5, 0.95)).toBeNull();
    expect(answerAt(0.02, 1 - 282 / PAGE.h)).toBeNull();
  });
});

describe("stampSpot", () => {
  const seeds = ["att-1", "att-2", "9f0c", "zz"];

  it("is the same spot every time", () => {
    expect(stampSpot(3, "att-1")).toEqual(stampSpot(3, "att-1"));
  });

  it("never moves a stamp when more arrive", () => {
    // It depends only on (i, seed), never on how many stamps exist.
    expect(stampSpot(0, "att-1")).toEqual(stampSpot(0, "att-1"));
    expect(stampSpot(0, "att-1")).not.toEqual(stampSpot(0, "att-2"));
  });

  it("keeps the first twelve on the page, tilted a little, and spread out", () => {
    for (const seed of seeds) {
      for (let i = 0; i < 12; i++) {
        const s = stampSpot(i, seed);
        expect(s.x).toBeGreaterThanOrEqual(140);
        expect(s.x).toBeLessThanOrEqual(884);
        expect(s.y).toBeGreaterThanOrEqual(120);
        expect(s.y).toBeLessThanOrEqual(600);
        expect(Math.abs(s.rot)).toBeLessThanOrEqual(0.35);
        expect(s.scale).toBeGreaterThanOrEqual(0.9);
        expect(s.scale).toBeLessThanOrEqual(1.1);
        if (i > 0) {
          const p = stampSpot(i - 1, seed);
          expect(Math.hypot(s.x - p.x, s.y - p.y)).toBeGreaterThanOrEqual(120);
        }
      }
    }
  });
});

describe("fitText", () => {
  const measure = (t: string, size: number) => t.length * size * 0.5;

  it("keeps a short text at the largest size", () => {
    expect(fitText("Ana", 600, { max: 64, min: 34 }, measure)).toEqual({ size: 64, lines: ["Ana"] });
  });

  it("shrinks a longer text until it fits on one line", () => {
    const r = fitText("a".repeat(30), 600, { max: 64, min: 34 }, measure);
    expect(r.lines).toHaveLength(1);
    expect(r.size).toBeLessThan(64);
    expect(measure(r.lines[0], r.size)).toBeLessThanOrEqual(600);
  });

  it("wraps at the smallest size when one line can't hold it", () => {
    const r = fitText("Closest to the snack trolley on the plane", 400, { max: 46, min: 34 }, measure);
    expect(r.size).toBe(34);
    expect(r.lines).toHaveLength(2);
    for (const l of r.lines) expect(measure(l, 34)).toBeLessThanOrEqual(400);
  });

  it("cuts a third line short with an ellipsis", () => {
    const r = fitText("one two three four five six seven eight nine ten eleven twelve", 200, { max: 34, min: 34 }, measure, 2);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[1].endsWith("…")).toBe(true);
    expect(measure(r.lines[1], 34)).toBeLessThanOrEqual(200);
  });

  it("breaks a single word too long for the line", () => {
    const r = fitText("x".repeat(40), 200, { max: 34, min: 34 }, measure, 2);
    for (const l of r.lines) expect(measure(l, 34)).toBeLessThanOrEqual(200);
  });
});

describe("sceneArt", () => {
  const q = { id: "q-0000000a", scene: "Boarding", text: "Which seat?", image: null, answers: [
    { id: "a-00000001", text: "Window", icon: "🪟", personality: "p" },
  ] };
  const loaded = { naturalWidth: 1600, naturalHeight: 1000 } as HTMLImageElement;
  const failed = { naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement;

  it("shows the organiser's picture once it has loaded", () => {
    expect(sceneArt(q, 0, loaded)).toEqual({ kind: "image", img: loaded });
  });

  it("falls back to a tinted panel with the first answer's icon", () => {
    expect(sceneArt(q, 2, null)).toEqual({ kind: "panel", tint: SCENE_TINTS[2], emoji: "🪟" });
  });

  it("falls back when the picture failed to load", () => {
    expect(sceneArt(q, 0, failed).kind).toBe("panel");
  });

  it("uses a plane when no answer has an icon, and cycles the tints", () => {
    const bare = { ...q, answers: [{ ...q.answers[0], icon: null }] };
    expect(sceneArt(bare, SCENE_TINTS.length, null)).toEqual({ kind: "panel", tint: SCENE_TINTS[0], emoji: "✈️" });
  });
});
