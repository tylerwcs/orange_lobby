import { cardRatio } from "../../lib/card";
import { arrivals, pruneQueue, spotlightMs, splitQueue } from "../../lib/spotlight";
import {
  assignColumns, columnCount, columnSpeed, insertionFor, keepAnchor, layoutColumn, minCycleFor, padToFill, rebase, shortestColumn, visibleSlots,
  type ColumnLayout,
} from "../../lib/wall-layout";
import type { WallSpeed } from "../../lib/settings";
import type { WallCard, WallState } from "../../lib/wire";

export type WallSlot = { key: string; card: WallCard; top: number; fading: boolean };
export type WallSnapshot = {
  colW: number;
  cardW: number;
  columns: { x: number; slots: WallSlot[] }[];
  spotlight: { card: WallCard; column: number } | null;
};

/** One card's place in a column. A padded column holds a card several times, each with its own React key. */
type Entry = { id: string; key: string };
type Col = { entries: Entry[]; layout: ColumnLayout; offset: number; base: number; speed: number };

const FADE_MS = 700;
const SNAPSHOT_MS = 250;
const SOFT_REBASE = 1_000_000;
const HARD_REBASE = 8_000_000;
const CARD_OF_COLUMN = 0.84;
const GAP_OF_COLUMN = 0.08;
/** The tallest card the 16:9 clamp allows, as a multiple of its width: a stable bound for padding. */
const TALLEST = cardRatio(1, 10_000);

const EMPTY: WallSnapshot = { colW: 0, cardW: 0, columns: [], spotlight: null };

/**
 * The wall's motion (D484), outside React. A card's top is drawn at `slot.y − base` and the
 * column's track is moved by `−(offset − base)`, so a change that moves `offset` moves `base` with
 * it and nothing on screen jumps. Every column is padded (`padToFill`) so no card shows twice at
 * once and a new one can always arrive unseen.
 */
export function createWallEngine() {
  let cards = new Map<string, WallCard>();
  const known = new Map<string, WallCard>();
  let size = { w: 1920, h: 1080 };
  let columnsSetting: "auto" | number = "auto";
  let speed: WallSpeed = "medium";
  let cols: Col[] = [];
  let geometryKey = "";
  let serial = 0;
  let seen: Set<string> | null = null;
  let queue: WallCard[] = [];
  let current: { card: WallCard; column: number; until: number } | null = null;
  let preparing = false;
  const fading = new Map<string, number>();
  const tracks: (HTMLDivElement | null)[] = [];
  let snapshot = EMPTY;
  const listeners = new Set<() => void>();
  let raf = 0;
  let last = 0;
  let lastSnap = 0;

  const geometry = () => {
    const n = columnCount(columnsSetting, size.w, size.h);
    const colW = size.w / n;
    const cardW = colW * CARD_OF_COLUMN;
    const gap = colW * GAP_OF_COLUMN;
    return { n, colW, cardW, gap, minCycle: minCycleFor(size.h, cardW * TALLEST, gap), key: `${n}:${cardW}:${size.h}` };
  };
  const heightOf = (id: string) => {
    const c = known.get(id);
    return c ? geometry().cardW * cardRatio(c.w, c.h) : 0;
  };
  const mint = (id: string): Entry => ({ id, key: `${id}#${serial++}` });
  const relayoutColumn = (col: Col) => { col.layout = layoutColumn(col.entries.map((e) => heightOf(e.id)), geometry().gap); };
  const onWall = () => new Set(cols.flatMap((c) => c.entries.map((e) => e.id)));
  const waitingIds = () => new Set([...queue.map((c) => c.id), ...(current ? [current.card.id] : [])]);
  const transformOf = (col: Col) => `translate3d(0, ${-(col.offset - col.base)}px, 0)`;

  /** Moves `offset` to keep the screen still, and `base` with it so the drawn tops stay put. */
  const settle = (col: Col, prev: ColumnLayout, newIndexOf: (i: number) => number | null) => {
    const offset = keepAnchor(prev, col.layout, col.offset, size.h, newIndexOf);
    col.base += offset - col.offset;
    col.offset = offset;
  };

  /** A column whose pass fell short of the minimum gets copies appended. Rare, and may move cards. */
  const topUp = (col: Col) => {
    const g = geometry();
    if (col.entries.length === 0 || col.layout.cycle >= g.minCycle) return;
    const prev = col.layout;
    const padded = padToFill(col.entries.map((e) => e.id), heightOf, g.gap, g.minCycle);
    col.entries = [...col.entries, ...padded.slice(col.entries.length).map(mint)];
    relayoutColumn(col);
    settle(col, prev, (i) => i);
  };

  /** Everything laid out afresh: the first load, a tiny wall, a column left empty or new geometry (Review Focus 3). */
  function relayoutAll() {
    const g = geometry();
    const waiting = waitingIds();
    const items = [...cards.values()].filter((c) => !waiting.has(c.id)).map((c) => ({ id: c.id, height: heightOf(c.id) }));
    const sameGeometry = geometryKey === g.key;
    cols = assignColumns(items, g.n, g.gap).map((ids, i) => {
      // On the same geometry a column that keeps a card keeps its keys too, so React does not remount it.
      const spare = new Map<string, string[]>();
      if (sameGeometry) for (const e of cols[i]?.entries ?? []) spare.set(e.id, [...(spare.get(e.id) ?? []), e.key]);
      const entries = padToFill(ids, heightOf, g.gap, g.minCycle).map((id) => {
        const key = spare.get(id)?.shift();
        return key ? { id, key } : mint(id);
      });
      return {
        entries, layout: layoutColumn(entries.map((e) => heightOf(e.id)), g.gap),
        offset: cols[i]?.offset ?? 0, base: cols[i]?.base ?? 0, speed: columnSpeed(speed, i, size.h),
      };
    });
    geometryKey = g.key;
  }

  function insert(card: WallCard, column?: number) {
    if (cards.size <= geometry().n) { relayoutAll(); return; }
    const c = column ?? shortestColumn(cols.map((x) => x.layout.cycle));
    const col = cols[c];
    if (!col) return;
    const { index, offset } = insertionFor(col.layout, col.offset, size.h, col.speed >= 0 ? 1 : -1, heightOf(card.id), geometry().gap);
    col.entries.splice(index, 0, mint(card.id));
    relayoutColumn(col);
    col.base += offset - col.offset;
    col.offset = offset;
    // Only a column that was empty can be short after an insert.
    topUp(col);
  }

  /** Every copy of a taken-down card leaves its column in one step. */
  function remove(id: string) {
    for (const col of cols) {
      if (!col.entries.some((e) => e.id === id)) continue;
      const prev = col.layout;
      const newIndex: (number | null)[] = [];
      let removed = 0;
      col.entries.forEach((e, i) => {
        if (e.id === id) { newIndex[i] = null; removed++; }
        else newIndex[i] = i - removed;
      });
      col.entries = col.entries.filter((e) => e.id !== id);
      relayoutColumn(col);
      settle(col, prev, (i) => newIndex[i] ?? null);
      topUp(col);
    }
    // A column with nothing left would stand bare on the LED: lay the wall out again instead.
    if (cols.some((c) => c.entries.length === 0) && onWall().size > 0) relayoutAll();
  }

  function emit() {
    const g = geometry();
    snapshot = {
      colW: g.colW,
      cardW: g.cardW,
      columns: cols.map((col, i) => ({
        x: i * g.colW,
        slots: visibleSlots(col.layout, col.offset, size.h, size.h).flatMap((s) => {
          const entry = col.entries[s.index];
          const card = entry && known.get(entry.id);
          return card ? [{ key: `${entry.key}:${s.repeat}`, card, top: s.y - col.base, fading: fading.has(entry.id) }] : [];
        }),
      })),
      spotlight: current ? { card: current.card, column: current.column } : null,
    };
    listeners.forEach((l) => l());
  }

  function startSpotlight() {
    const card = queue.shift();
    if (!card) return;
    preparing = true;
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      preparing = false;
      if (!cards.has(card.id)) return;
      current = { card, column: shortestColumn(cols.map((c) => c.layout.cycle)), until: Date.now() + spotlightMs(queue.length) };
      emit();
    };
    // Shown once its photo is decoded, so it never arrives blank; 4 s at most.
    const img = new Image();
    img.src = card.src ?? "";
    const timeout = setTimeout(go, 4000);
    img.decode().then(go, go).finally(() => clearTimeout(timeout));
  }

  function frame(t: number) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    const now = Date.now();
    let dirty = false;
    cols.forEach((col, i) => {
      col.offset += col.speed * dt;
      const span = col.offset - col.base;
      if (Math.abs(span) > HARD_REBASE || (current && Math.abs(span) > SOFT_REBASE)) {
        // Whole cycles off `offset`: the same picture, with new repeat numbers and so fresh keys,
        // so no card's `top` transition animates the jump.
        col.offset -= span - rebase(span, col.layout.cycle, 0);
        dirty = true;
      }
      const el = tracks[i];
      if (el) el.style.transform = transformOf(col);
    });
    for (const [id, at] of fading) {
      if (now - at >= FADE_MS) { fading.delete(id); remove(id); dirty = true; }
    }
    if (current && now >= current.until) {
      const done = current;
      current = null;
      if (cards.has(done.card.id)) insert(done.card, done.column);
      dirty = true;
    }
    if (!current && !preparing && queue.length) startSpotlight();
    if (dirty || t - lastSnap >= SNAPSHOT_MS) {
      lastSnap = t;
      emit();
    }
  }

  return {
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    getSnapshot: () => snapshot,
    setTrack(i: number, el: HTMLDivElement | null) {
      tracks[i] = el;
      // A freshly mounted track starts where its column is, not at 0 until the next frame.
      const col = cols[i];
      if (el && col) el.style.transform = transformOf(col);
    },
    /** A new poll answer or a new screen size. */
    update(state: WallState, viewport: { w: number; h: number }) {
      cards = new Map(state.cards.map((c) => [c.id, c]));
      for (const c of state.cards) known.set(c.id, c);
      columnsSetting = state.columns;
      speed = state.speed;
      size = viewport;
      const live = new Set(cards.keys());
      queue = pruneQueue(queue, live);
      if (current && !live.has(current.card.id)) current = null;

      const placed = onWall();
      const waiting = waitingIds();
      const added = state.cards.filter((c) => !placed.has(c.id) && !waiting.has(c.id));
      const fresh = new Set(arrivals(seen, added, Date.now()).map((c) => c.id));
      const split = splitQueue([...queue, ...added.filter((c) => fresh.has(c.id))]);
      queue = split.spotlight;
      const direct = [...added.filter((c) => !fresh.has(c.id)), ...split.direct];
      for (const id of placed) if (!live.has(id) && !fading.has(id)) fading.set(id, Date.now());

      const g = geometry();
      if (seen === null || cards.size <= g.n || geometryKey !== g.key) relayoutAll();
      else direct.forEach((c) => insert(c));
      cols.forEach((col, i) => { col.speed = columnSpeed(speed, i, size.h); });
      seen = live;
      emit();
    },
    start() { if (!raf) raf = requestAnimationFrame(frame); },
    stop() { cancelAnimationFrame(raf); raf = 0; last = 0; },
  };
}
