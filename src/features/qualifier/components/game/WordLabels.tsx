"use client";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { Vector3, type Camera } from "three";
import { currentWord, type Slime } from "../../game/engine";
import { layoutLabels, type LabelBox } from "../../game/labels";
import { HEALTH, HEALTH_TRACK, LABEL_BG, LABEL_INK, LABEL_LOCK, LABEL_TYPED, css } from "../../game/palette";
import type { Head } from "./slimeFx";

/**
 * The slimes' words (D793): a speech bubble over each slime, as DOM above the canvas so the text
 * is crisp and the same size on screen however far the slime is. Each frame the scene projects
 * every slime's head and `layoutLabels` keeps the bubbles off each other (nearest first; the
 * locked one never moves for another). Typed letters are coloured; the locked bubble is
 * highlighted. A boss's bubble holds its whole sentence, the current word marked, over a health
 * bar that loses a chunk per word.
 *
 * All imperative: the elements are made, changed and moved from the frame loop, never through
 * React state. A bubble is rebuilt only when its text, progress or lock changes.
 */

export type LabelsApi = {
  update(f: { slimes: readonly Slime[]; heads: ReadonlyMap<number, Head>; camera: Camera; w: number; h: number; lock: number | null; dt: number }): void;
};

type Label = {
  el: HTMLDivElement;
  key: string;
  w: number;
  h: number;
  /** The overlap shift actually shown, eased towards the layout's. */
  ox: number;
  oy: number;
  placed: boolean;
  z: number;
  shown: boolean;
};

const INK = css(LABEL_INK);
const TYPED = css(LABEL_TYPED);
const LOCK = css(LABEL_LOCK);
const SMALL_FONT = "clamp(15px, 2.6vmin, 22px)";
const BOSS_FONT = "clamp(14px, 2.3vmin, 20px)";
/** How fast a bubble slides out of another's way (per s). */
const EASE = 18;

function span(text: string, color: string, extra?: Partial<CSSStyleDeclaration>): HTMLSpanElement {
  const s = document.createElement("span");
  s.textContent = text;
  s.style.color = color;
  if (extra) Object.assign(s.style, extra);
  return s;
}

/** The current word: typed letters in the typed colour, the rest in ink. */
function wordSpans(word: string, typed: number): HTMLSpanElement[] {
  const out: HTMLSpanElement[] = [];
  if (typed > 0) out.push(span(word.slice(0, typed), TYPED));
  if (typed < word.length) out.push(span(word.slice(typed), INK));
  return out;
}

function build(el: HTMLDivElement, s: Slime, locked: boolean, viewW: number) {
  el.replaceChildren();
  const boss = s.kind === "boss";
  const edge = locked ? LOCK : INK;
  const pill = document.createElement("div");
  Object.assign(pill.style, {
    background: css(LABEL_BG, 0.95),
    border: `3px solid ${edge}`,
    borderRadius: boss ? "16px" : "999px",
    padding: boss ? "0.35em 0.7em 0.45em" : "0.12em 0.65em 0.18em",
    fontSize: boss ? BOSS_FONT : SMALL_FONT,
    lineHeight: "1.2",
    letterSpacing: "0.02em",
    color: INK,
    whiteSpace: boss ? "normal" : "nowrap",
    maxWidth: boss ? `${Math.round(Math.min(viewW * 0.86, 560))}px` : "none",
    textAlign: "center",
    boxShadow: locked ? `0 0 0 4px ${css(LABEL_LOCK, 0.22)}, 0 3px 0 ${css(LABEL_INK, 0.22)}` : `0 3px 0 ${css(LABEL_INK, 0.22)}`,
    transform: locked ? "scale(1.12)" : "none",
    transformOrigin: "50% 100%",
  } satisfies Partial<CSSStyleDeclaration>);

  if (!boss) {
    pill.append(...wordSpans(currentWord(s), s.typed));
  } else {
    const text = document.createElement("div");
    s.words.forEach((w, i) => {
      if (i > 0) text.append(" ");
      if (i < s.wordIndex) text.append(span(w, TYPED, { opacity: "0.45", textDecoration: "line-through" }));
      else if (i > s.wordIndex) text.append(span(w, INK, { opacity: "0.8" }));
      else {
        const cur = document.createElement("span");
        Object.assign(cur.style, {
          background: css(LABEL_TYPED, 0.12),
          borderRadius: "6px",
          padding: "0 0.15em",
          textDecoration: "underline",
          textDecorationColor: LOCK,
          textDecorationThickness: "3px",
          textUnderlineOffset: "4px",
        } satisfies Partial<CSSStyleDeclaration>);
        cur.append(...wordSpans(w, s.typed));
        text.append(cur);
      }
    });
    // Health: one chunk per word still to type.
    const n = s.words.length;
    const track = document.createElement("div");
    Object.assign(track.style, {
      position: "relative", height: "8px", marginTop: "0.4em", borderRadius: "4px", overflow: "hidden", background: css(HEALTH_TRACK),
    } satisfies Partial<CSSStyleDeclaration>);
    const fill = document.createElement("div");
    Object.assign(fill.style, {
      position: "absolute", inset: "0", width: `${((n - s.wordIndex) / n) * 100}%`, background: css(HEALTH),
    } satisfies Partial<CSSStyleDeclaration>);
    const notches = document.createElement("div");
    Object.assign(notches.style, {
      position: "absolute", inset: "0",
      backgroundImage: `linear-gradient(to right, transparent calc(100% - 2px), ${css(LABEL_BG, 0.9)} 0)`,
      backgroundSize: `${100 / n}% 100%`,
    } satisfies Partial<CSSStyleDeclaration>);
    track.append(fill, notches);
    pill.append(text, track);
  }

  // The bubble's tail, pointing down at the slime.
  const tail = document.createElement("div");
  Object.assign(tail.style, {
    width: "0", height: "0", marginTop: "-1px",
    borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: `9px solid ${edge}`,
  } satisfies Partial<CSSStyleDeclaration>);
  el.append(pill, tail);
}

const v = new Vector3();

export function WordLabels({ ref }: { ref?: Ref<LabelsApi> }) {
  const root = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<number, Label>());

  useEffect(() => {
    const map = labels.current;
    return () => {
      map.forEach((l) => l.el.remove());
      map.clear();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    update({ slimes, heads, camera, w, h, lock, dt }) {
      const host = root.current;
      if (!host) return;
      const map = labels.current;
      const seen = new Set<number>();
      const boxes: LabelBox[] = [];
      const anchors = new Map<number, { x: number; y: number }>();
      for (const s of slimes) {
        const head = heads.get(s.id);
        if (!head) continue;
        seen.add(s.id);
        let l = map.get(s.id);
        if (!l) {
          const el = document.createElement("div");
          Object.assign(el.style, {
            position: "absolute", left: "0", top: "0", display: "flex", flexDirection: "column", alignItems: "center",
            willChange: "transform", fontWeight: "800",
          } satisfies Partial<CSSStyleDeclaration>);
          host.append(el);
          l = { el, key: "", w: 0, h: 0, ox: 0, oy: 0, placed: false, z: -1, shown: true };
          map.set(s.id, l);
        }
        const locked = lock === s.id;
        // The view's size is in the key too: font sizes and the boss's width follow it.
        const key = `${s.wordIndex}|${s.typed}|${locked ? 1 : 0}|${Math.round(w / 40)}x${Math.round(h / 40)}`;
        if (key !== l.key) {
          build(l.el, s, locked, w);
          l.key = key;
          l.w = l.el.offsetWidth;
          l.h = l.el.offsetHeight;
        }
        // Behind the camera (it never should be): hide rather than mirror it onto the screen.
        v.set(head.x, head.y, head.z).project(camera);
        const visible = v.z < 1;
        if (visible !== l.shown) {
          l.el.style.display = visible ? "flex" : "none";
          l.shown = visible;
        }
        if (!visible) continue;
        const ax = ((v.x + 1) / 2) * w - l.w / 2;
        const ay = ((1 - v.y) / 2) * h - l.h;
        anchors.set(s.id, { x: ax, y: ay });
        boxes.push({ id: s.id, x: ax, y: ay, w: l.w, h: l.h, near: locked ? -1 : head.d });
        const z = locked ? 1000 : 500 - Math.round(head.d * 10);
        if (z !== l.z) {
          l.el.style.zIndex = String(z);
          l.z = z;
        }
      }
      for (const [id, l] of map) {
        if (!seen.has(id)) {
          l.el.remove();
          map.delete(id);
        }
      }
      const placed = layoutLabels(boxes, { w, h });
      const ease = 1 - Math.exp(-dt * EASE);
      for (const [id, at] of placed) {
        const l = map.get(id);
        const a = anchors.get(id);
        if (!l || !a) continue;
        // Follow the slime exactly; only the shift out of another bubble's way is eased.
        const tx = at.x - a.x;
        const ty = at.y - a.y;
        if (!l.placed) {
          l.ox = tx;
          l.oy = ty;
          l.placed = true;
        } else {
          l.ox += (tx - l.ox) * ease;
          l.oy += (ty - l.oy) * ease;
        }
        l.el.style.transform = `translate3d(${Math.round(a.x + l.ox)}px, ${Math.round(a.y + l.oy)}px, 0)`;
      }
    },
  }), []);

  return <div ref={root} aria-hidden className="pointer-events-none absolute inset-0 select-none overflow-hidden font-game" />;
}
