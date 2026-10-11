import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWallEngine } from "@/features/polaroid/components/wall/engine";
import { cardRatio } from "@/features/polaroid/lib/card";
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
  now: 0, key: String(list.length), cards: list, stickerSrc: {}, columns: "auto", speed: "medium", background: null, brand: null, qr: null, open: true,
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
      return col.slots.map((s) => ({ key: s.key, id: s.card.id, y: s.top + shift, h: snap.cardW * cardRatio(s.card.w, s.card.h) }));
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
