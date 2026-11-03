"use client";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { Vector3, type Camera } from "three";
import type { Slime } from "../../game/engine";
import { layoutLabels, type LabelBox } from "../../game/labels";
import { BITE_BG, HEALTH, HEALTH_TRACK, LABEL_BG, LABEL_INK, LABEL_LOCK, LABEL_TYPED, WARN, css, slimeColour } from "../../game/palette";
import { STICK_MS } from "../../game/rules";
import type { Head } from "./slimeFx";

/**
 * The slimes' words (D793): a speech bubble over each slime, as DOM above the canvas so the text
 * is crisp and the same size on screen however far the slime is. Each frame the scene projects
 * every slime's head and `layoutLabels` keeps the bubbles off each other (nearest first; the
 * locked one never moves for another). Typed letters are coloured; the locked bubble is
 * highlighted. A boss's bubble holds its whole sentence, the current word marked, over a health
 * bar that loses a chunk per word.
 *
 * A biting slime (stuck on the player, its 3 s running) is the loudest thing on screen: its bubble
 * turns red under a "BITING!" tag, pulses, and drains a bar as its 3 s run out; and the edge of
 * the screen on its side glows red, pulsing faster as the bite nears (a slime biting from out of
 * view, on a narrow phone, still shows).
 *
 * A word typed shows its points rising off the bubble in the slime's colour ("+60", `float`,
 * D816), from where the bubble last was: the scene floats them before the bubbles update.
 *
 * All imperative: the elements are made, changed and moved from the frame loop, never through
 * React state. A bubble is rebuilt only when its text, progress or lock changes.
 */

export type LabelsApi = {
  update(f: { slimes: readonly Slime[]; heads: ReadonlyMap<number, Head>; camera: Camera; w: number; h: number; lock: number | null; dt: number }): void;
  /** Points rising off slime `id`'s bubble (where it last was); nothing if it never had one. */
  float(id: number, text: string): void;
};

type Label = {
  el: HTMLDivElement;
  /** The bubble, and a biting slime's draining bar (else null). */
  pill: HTMLDivElement | null;
  bite: HTMLDivElement | null;
  /** The bubble's resting scale (the locked one is bigger); a biting one pulses about it. */
  scale: number;
  /** A biting bubble's pulse phase (rad), advanced by dt × its rising rate (never t × rate, which jitters). */
  pulse: number;
  key: string;
  w: number;
  h: number;
  /** The overlap shift actually shown, eased towards the layout's. */
  ox: number;
  oy: number;
  placed: boolean;
  z: number;
  shown: boolean;
  /** The slime's colour, for its floating points. */
  color: string;
  /** Where the bubble was last put (its top-left, px), or null before it is placed. */
  at: { x: number; y: number } | null;
};

const INK = css(LABEL_INK);
const TYPED = css(LABEL_TYPED);
const LOCK = css(LABEL_LOCK);
const BITE = css(WARN);
const SMALL_FONT = "clamp(15px, 2.6vmin, 22px)";
/** The HUD top bar's bottom padding (p-3): a label may sit in it, just under the chips. */
const HUD_PAD_PX = 8;
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

/** Fills `el` with the slime's bubble; returns the bubble and, while it bites, its draining bar. */
function build(el: HTMLDivElement, s: Slime, locked: boolean, viewW: number): { pill: HTMLDivElement; bite: HTMLDivElement | null } {
  el.replaceChildren();
  const boss = s.kind === "boss";
  const biting = s.stuckLeftMs !== null;
  const edge = biting ? BITE : locked ? LOCK : INK;
  const pill = document.createElement("div");
  Object.assign(pill.style, {
    background: biting ? css(BITE_BG, 0.97) : css(LABEL_BG, 0.95),
    border: `${biting ? 4 : 3}px solid ${edge}`,
    borderRadius: boss ? "16px" : "999px",
    padding: boss ? "0.35em 0.7em 0.45em" : "0.12em 0.65em 0.18em",
    fontSize: boss ? BOSS_FONT : SMALL_FONT,
    lineHeight: "1.2",
    letterSpacing: "0.02em",
    color: INK,
    whiteSpace: boss ? "normal" : "nowrap",
    maxWidth: boss ? `${Math.round(Math.min(viewW * 0.86, 560))}px` : "none",
    textAlign: "center",
    boxShadow: biting
      ? `0 0 0 5px ${css(WARN, 0.3)}, 0 0 22px ${css(WARN, 0.55)}`
      : locked ? `0 0 0 4px ${css(LABEL_LOCK, 0.22)}, 0 3px 0 ${css(LABEL_INK, 0.22)}` : `0 3px 0 ${css(LABEL_INK, 0.22)}`,
    transform: locked ? "scale(1.12)" : "none",
    transformOrigin: "50% 100%",
  } satisfies Partial<CSSStyleDeclaration>);

  if (biting) {
    const tag = document.createElement("div");
    tag.textContent = "BITING!";
    Object.assign(tag.style, {
      alignSelf: "center", marginBottom: "4px", padding: "0.1em 0.6em", borderRadius: "999px",
      background: BITE, color: css(LABEL_BG), fontSize: "clamp(11px, 1.8vmin, 15px)", letterSpacing: "0.08em",
    } satisfies Partial<CSSStyleDeclaration>);
    el.append(tag);
  }

  if (!boss) {
    // A two-word slime: the word done struck through, the next one faded.
    s.words.forEach((w, i) => {
      if (i > 0) pill.append(" ");
      if (i < s.wordIndex) pill.append(span(w, TYPED, { opacity: "0.45", textDecoration: "line-through" }));
      else if (i > s.wordIndex) pill.append(span(w, INK, { opacity: "0.6" }));
      else pill.append(...wordSpans(w, s.typed));
    });
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

  let bite: HTMLDivElement | null = null;
  if (biting) {
    // The 3 s, draining.
    const track = document.createElement("div");
    Object.assign(track.style, {
      position: "relative", height: "6px", marginTop: "0.3em", borderRadius: "3px", overflow: "hidden", background: css(WARN, 0.2),
    } satisfies Partial<CSSStyleDeclaration>);
    bite = document.createElement("div");
    Object.assign(bite.style, { position: "absolute", inset: "0", background: BITE, transformOrigin: "0 50%" } satisfies Partial<CSSStyleDeclaration>);
    track.append(bite);
    pill.append(track);
  }

  // The bubble's tail, pointing down at the slime.
  const tail = document.createElement("div");
  Object.assign(tail.style, {
    width: "0", height: "0", marginTop: "-1px",
    borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: `9px solid ${edge}`,
  } satisfies Partial<CSSStyleDeclaration>);
  el.append(pill, tail);
  return { pill, bite };
}

/** The red glow down one edge of the screen while a slime bites on that side. */
function edgeGlow(side: "left" | "right"): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "absolute", top: "0", bottom: "0", [side]: "0", width: "min(28vw, 260px)", opacity: "0", zIndex: "2000",
    background: `linear-gradient(to ${side === "left" ? "right" : "left"}, ${css(WARN, 0.85)}, ${css(WARN, 0)})`,
  } satisfies Partial<CSSStyleDeclaration>);
  return el;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const v = new Vector3();

export function WordLabels({ ref }: { ref?: Ref<LabelsApi> }) {
  const root = useRef<HTMLDivElement>(null);
  const labels = useRef(new Map<number, Label>());
  const edges = useRef<{ els: [HTMLDivElement, HTMLDivElement]; shown: [number, number] } | null>(null);

  useEffect(() => {
    const map = labels.current;
    const host = root.current;
    const e = { els: [edgeGlow("left"), edgeGlow("right")] as [HTMLDivElement, HTMLDivElement], shown: [0, 0] as [number, number] };
    host?.append(...e.els);
    edges.current = e;
    return () => {
      map.forEach((l) => l.el.remove());
      map.clear();
      e.els.forEach((el) => el.remove());
      edges.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    float(id, text) {
      const host = root.current;
      const l = labels.current.get(id);
      if (!host || !l?.at || !l.shown) return;
      const el = document.createElement("div");
      el.textContent = text;
      Object.assign(el.style, {
        position: "absolute", left: "0", top: "0", zIndex: "1500", whiteSpace: "nowrap",
        fontSize: "clamp(22px, 4vmin, 34px)", lineHeight: "1", color: l.color,
        webkitTextStroke: `4px ${INK}`, paintOrder: "stroke fill",
        transform: `translate3d(${Math.round(l.at.x + l.w / 2)}px, ${Math.round(l.at.y)}px, 0) translateX(-50%)`,
      } satisfies Partial<CSSStyleDeclaration>);
      host.append(el);
      const base = el.style.transform;
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const anim = el.animate?.(
        still
          ? [{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }]
          : [
            { opacity: 0, transform: `${base} translateY(6px) scale(0.6)` },
            { opacity: 1, transform: `${base} translateY(-10px) scale(1.25)`, offset: 0.18 },
            { opacity: 1, transform: `${base} translateY(-34px) scale(1)`, offset: 0.6 },
            { opacity: 0, transform: `${base} translateY(-60px) scale(0.95)` },
          ],
        { duration: 900, easing: "ease-out", fill: "forwards" },
      );
      if (anim) anim.onfinish = () => el.remove();
      else el.remove();
    },
    update({ slimes, heads, camera, w, h, lock, dt }) {
      const host = root.current;
      if (!host) return;
      const map = labels.current;
      /** The edge glows' strength this frame, left and right. */
      const glow: [number, number] = [0, 0];
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
          l = {
            el, pill: null, bite: null, scale: 1, pulse: 0, key: "", w: 0, h: 0, ox: 0, oy: 0, placed: false, z: -1, shown: true,
            color: css(slimeColour(s.look, s.id)), at: null,
          };
          map.set(s.id, l);
        }
        const locked = lock === s.id;
        // The view's size is in the key too: font sizes and the boss's width follow it.
        const key = `${s.wordIndex}|${s.typed}|${locked ? 1 : 0}|${s.stuckLeftMs !== null ? 1 : 0}|${Math.round(w / 40)}x${Math.round(h / 40)}`;
        if (key !== l.key) {
          const built = build(l.el, s, locked, w);
          l.pill = built.pill;
          l.bite = built.bite;
          l.scale = locked ? 1.12 : 1;
          l.key = key;
          l.w = l.el.offsetWidth;
          l.h = l.el.offsetHeight;
        }
        // Behind the camera (it never should be): hide rather than mirror it onto the screen.
        v.set(head.x, head.y, head.z).project(camera);
        const visible = v.z < 1;
        if (s.stuckLeftMs !== null) {
          // 0 -> 1 through the bite: the bar drains, the bubble and the edge pulse harder and faster.
          const k = clamp01(1 - s.stuckLeftMs / STICK_MS);
          l.pulse += dt * (4 + 6 * k);
          const pulse = 0.5 + 0.5 * Math.sin(l.pulse);
          if (l.bite) l.bite.style.transform = `scaleX(${(1 - k).toFixed(3)})`;
          if (l.pill) l.pill.style.transform = `scale(${(l.scale * (1 + (0.04 + 0.06 * k) * pulse)).toFixed(3)})`;
          const strength = (0.45 + 0.55 * k) * (0.55 + 0.45 * pulse);
          // Its side of the screen; one in the middle (or behind) lights both edges a little.
          const sx = visible ? (v.x + 1) / 2 : 0.5;
          glow[0] = Math.max(glow[0], strength * Math.max(0.35, clamp01(1.4 - 2 * sx)));
          glow[1] = Math.max(glow[1], strength * Math.max(0.35, clamp01(2 * sx - 0.6)));
        }
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
      // Below the score and the clock (the HUD's top bar, less its bottom padding).
      const hud = host.closest("[data-game-stage]")?.querySelector<HTMLElement>("[data-hud-top]");
      const placed = layoutLabels(boxes, { w, h, top: hud ? hud.offsetHeight - HUD_PAD_PX : 0 });
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
        l.at = { x: a.x + l.ox, y: a.y + l.oy };
        l.el.style.transform = `translate3d(${Math.round(l.at.x)}px, ${Math.round(l.at.y)}px, 0)`;
      }
      const e = edges.current;
      if (e) {
        for (const i of [0, 1] as const) {
          const o = Math.round(glow[i] * 100) / 100;
          if (o === e.shown[i]) continue;
          e.els[i].style.opacity = String(o);
          e.shown[i] = o;
        }
      }
    },
  }), []);

  return <div ref={root} aria-hidden className="pointer-events-none absolute inset-0 select-none overflow-hidden font-game" />;
}
