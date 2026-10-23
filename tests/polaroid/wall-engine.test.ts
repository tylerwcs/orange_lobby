import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWallEngine } from "@/features/polaroid/components/wall/engine";
import { cardRatio } from "@/features/polaroid/lib/card";
import { PLAIN_LOOK } from "@/features/polaroid/lib/look";
import type { WallCard, WallState } from "@/features/polaroid/lib/wire";

const LED = { w: 5504, h: 2322 };
const TV = { w: 1920, h: 1080 };
const OLD = "2026-01-01T00:00:00.000Z";

// Mixed shapes, so columns differ in height; all old, so none of them asks for a spotlight.
const card = (i: number): WallCard => ({
  id: `c${i}`, src: null, w: 1200, h: [1600, 900, 1200, 2400][i % 4], message: "", stickers: [], tilt: 0, created_at: OLD,
});
const cards = (n: number) => Array.from({ length: n }, (_, i) => card(i));
const state = (list: WallCard[]): WallState => ({
  now: 0, key: String(list.length), cards: list, stickerSrc: {}, columns: "auto", speed: "medium", background: null, brand: null, look: PLAIN_LOOK, qr: null, open: true,
});

type Track = { style: { transform: string } };
let frame: ((t: number) => void) | null = null;
let t = 0;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
  frame = null;
  t = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => { frame = cb; return 1; });
  vi.stubGlobal("cancelAnimationFrame", () => { frame = null; });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(list: WallCard[], view = LED) {
  const engine = createWallEngine();
  const tracks: Track[] = [];
  engine.update(state(list), view);
  const attach = () => engine.getSnapshot().columns.forEach((_, i) => {
    tracks[i] ??= { style: { transform: "" } };
    engine.setTrack(i, tracks[i] as unknown as HTMLDivElement);
  });
  attach();
  engine.start();
  /** Runs `count` frames `ms` apart; a 0 ms frame moves nothing but rewrites every transform. */
  const run = (count: number, ms = 100) => {
    for (let k = 0; k < count; k++) {
      t += ms;
      vi.setSystemTime(Date.now() + ms);
      frame?.(t);
    }
  };
  run(1, 0);
  /** Time passes with no frame, so nothing scrolls. */
  const wait = (ms: number) => vi.setSystemTime(Date.now() + ms);
  /** Every slot's position on the screen, by its React key. */
  const screen = () => {
    const snap = engine.getSnapshot();
    return snap.columns.map((col, i) => {
      const shift = Number(/translate3d\(0, (-?[\d.e+-]+)px/.exec(tracks[i]?.style.transform ?? "")?.[1] ?? 0);
      return col.slots.map((s) => ({
        key: s.key, id: s.card.id, y: s.top + shift, from: s.from === undefined ? undefined : s.from + shift, h: snap.cardW * cardRatio(s.card.w, s.card.h),
      }));
    });
  };
  const onScreen = (view = LED) => screen().map((col) => col.filter((s) => s.y + s.h > 0 && s.y < view.h));
  return { engine, run, wait, screen, onScreen, attach };
}

describe("the wall engine (D484)", () => {
  it("fills every column of a sparse wall, never showing one copy of a card twice at once", () => {
    const { onScreen } = setup(cards(3));
    const cols = onScreen();
    expect(cols).toHaveLength(7);
    for (const col of cols) {
      expect(col.length).toBeGreaterThan(0);
      // A slot's key is "<copy>:<pass>": the same copy on two passes would mean a seam on screen.
      const copies = col.map((s) => s.key.slice(0, s.key.lastIndexOf(":")));
      expect(new Set(copies).size).toBe(col.length);
    }
  });

  it("brings a new card in without moving anything on screen, on a sparse wall too", () => {
    for (const n of [9, 30]) {
      const { engine, run, onScreen, screen } = setup(cards(n));
      run(200);
      const before = onScreen();
      engine.update(state(cards(n + 1)), LED);
      run(1, 0);
      const after = screen();
      before.forEach((col, i) => {
        for (const s of col) expect(after[i].find((x) => x.key === s.key)?.y).toBeCloseTo(s.y, 6);
      });
      expect(after.flat().some((s) => s.id === `c${n}`)).toBe(true);
    }
  });

  it("takes every copy of a removed card off the wall, leaving the other columns still", () => {
    const { engine, run, wait, onScreen, screen } = setup(cards(9));
    run(200);
    const before = onScreen();
    // A card from a column that keeps others, so the column closes up rather than re-laying the wall out.
    // With more cards than columns each card sits in one column only.
    const from = before.findIndex((col) => new Set(col.map((s) => s.id)).size > 1);
    const target = before[from][0].id;
    const list = cards(9).filter((c) => c.id !== target);
    engine.update(state(list), LED);
    run(1, 0);
    expect(screen().flat().filter((s) => s.id === target).length).toBeGreaterThan(0);
    wait(800);
    run(1, 0);
    const after = onScreen();
    expect(screen().flat().some((s) => s.id === target)).toBe(false);
    before.forEach((col, i) => {
      if (i === from) return;
      expect(after[i].map((s) => [s.key, s.y.toFixed(3)])).toEqual(col.map((s) => [s.key, s.y.toFixed(3)]));
    });
    for (const col of after) expect(col.length).toBeGreaterThan(0);
  });

  it("closes a takedown's gap in a padded column by gliding, never by streaking whole passes", () => {
    const { engine, run, wait, onScreen, screen } = setup(cards(9));
    run(200);
    const snap = engine.getSnapshot();
    const before = onScreen();
    // Everything drawn, the buffer above and below the screen too: a card can glide in from there.
    const drawn = screen();
    // A column of two cards, padded; taking one down leaves it short, so it is padded again.
    const from = before.findIndex((col) => new Set(col.map((s) => s.id)).size === 2);
    expect(from).toBeGreaterThanOrEqual(0);
    const target = before[from].find((s) => s.id !== before[from][0].id)!.id;
    const removedH = before[from].find((s) => s.id === target)!.h + snap.colW * 0.08;
    engine.update(state(cards(9).filter((c) => c.id !== target)), LED);
    run(1, 0);
    wait(800);
    run(1, 0);
    const after = onScreen()[from];
    expect(after.some((s) => s.id === target)).toBe(false);
    expect(after.some((s) => s.from !== undefined)).toBe(true);

    const anchor = before[from].find((s) => s.id !== target)!;
    const all = drawn[from];
    const prior = new Map(all.map((s) => [s.key, s]));
    for (const s of after) {
      const kept = prior.get(s.key);
      // Where the card is seen to start: `from` when sent, else where its element already was.
      expect(s.from !== undefined || kept !== undefined).toBe(true);
      const start = s.from ?? kept!.y;
      if (s.from !== undefined && s.from === s.y) continue; // a jump in place: nothing seen to move
      // It starts where this same card stood, and glides up by exactly the gaps closed above it.
      expect(all.some((b) => b.id === s.id && Math.abs(b.y - start) < 0.5)).toBe(true);
      const closed = all.filter((b) => b.id === target && b.y > anchor.y && b.y < start).length;
      expect(start - s.y).toBeCloseTo(closed * removedH, 3);
    }
  });

  it("never leaves a column empty when its only card is taken down", () => {
    const { engine, run, wait, onScreen } = setup(cards(8));
    const lonely = onScreen().find((col) => new Set(col.map((s) => s.id)).size === 1)![0].id;
    engine.update(state(cards(8).filter((c) => c.id !== lonely)), LED);
    wait(800);
    run(1, 0);
    const after = onScreen();
    expect(after).toHaveLength(7);
    for (const col of after) expect(col.length).toBeGreaterThan(0);
    expect(after.flat().some((s) => s.id === lonely)).toBe(false);
  });

  it("still places a spotlit card when its column is gone after a resize", async () => {
    vi.stubGlobal("Image", class { src = ""; decode() { return Promise.resolve(); } });
    const { engine, run, screen, attach } = setup(cards(12));
    const fresh = { ...card(12), created_at: new Date(Date.now()).toISOString() };
    engine.update(state([...cards(12), fresh]), LED);
    run(1);
    await Promise.resolve();
    await Promise.resolve();
    const spot = engine.getSnapshot().spotlight;
    expect(spot?.card.id).toBe("c12");
    expect(spot!.column).toBeGreaterThanOrEqual(3);
    engine.update({ ...state([...cards(12), fresh]), columns: 3 }, LED);
    attach();
    run(1, 7000);
    expect(engine.getSnapshot().spotlight).toBeNull();
    expect(screen().flat().some((s) => s.id === "c12")).toBe(true);
  });

  it("judges a new card's age on server time, so a LED PC with a fast clock still spotlights it", async () => {
    vi.stubGlobal("Image", class { src = ""; decode() { return Promise.resolve(); } });
    const FIVE_MIN = 5 * 60_000;
    for (const [offset, spotlit] of [[-FIVE_MIN, true], [0, false]] as const) {
      const { engine, run } = setup(cards(12));
      // The browser clock is five minutes ahead of the server, which stamped the card just now.
      const fresh = { ...card(12), created_at: new Date(Date.now()).toISOString() };
      vi.setSystemTime(Date.now() + FIVE_MIN);
      engine.update(state([...cards(12), fresh]), LED, offset);
      run(1);
      await Promise.resolve();
      await Promise.resolve();
      expect(engine.getSnapshot().spotlight?.card.id).toBe(spotlit ? "c12" : undefined);
      vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    }
  });

  it("re-lays the wall out for a 16:9 TV with no card lost", () => {
    const { engine, run, screen, attach } = setup(cards(20));
    run(50);
    engine.update(state(cards(20)), TV);
    attach();
    run(1, 0);
    const cols = screen();
    expect(cols).toHaveLength(5);
    expect(new Set(cols.flat().map((s) => s.id)).size).toBe(20);
  });
});
