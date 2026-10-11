"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { clampPlacement, type StickerPlacement } from "../lib/placement";
import { handleDrag, pinch, type Point } from "../lib/gesture";
import styles from "../polaroid.module.css";

type Gesture = { index: number; mode: "move" | "handle"; base: StickerPlacement; start: Map<number, Point>; origin: DOMRect };

/** The composer's editable stickers (D482): drag, pinch to scale and rotate, a corner handle for one thumb, × to remove. */
export function StickerLayer({ placed, onChange, selected, onSelect, width, ratio, srcs }: {
  placed: StickerPlacement[];
  onChange: (next: StickerPlacement[]) => void;
  selected: number | null;
  onSelect: (index: number | null) => void;
  width: number;
  ratio: number;
  srcs: Record<string, string>;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const live = useRef(new Map<number, Point>());
  const latest = useRef(placed);
  useEffect(() => { latest.current = placed; }, [placed]);

  useEffect(() => {
    const at = (e: PointerEvent, origin: DOMRect): Point => ({ x: e.clientX - origin.left, y: e.clientY - origin.top });
    const restart = (g: Gesture) => {
      g.base = latest.current[g.index];
      g.start = new Map(live.current);
    };
    const move = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || !live.current.has(e.pointerId)) return;
      e.preventDefault();
      live.current.set(e.pointerId, at(e, g.origin));
      const ids = [...live.current.keys()];
      let next: StickerPlacement;
      if (g.mode === "handle") {
        const centre = { x: g.base.x * width, y: g.base.y * width };
        next = { ...g.base, ...handleDrag(centre, g.start.get(ids[0])!, live.current.get(ids[0])!, g.base) };
      } else if (ids.length >= 2 && g.start.has(ids[0]) && g.start.has(ids[1])) {
        next = { ...g.base, ...pinch([g.start.get(ids[0])!, g.start.get(ids[1])!], [live.current.get(ids[0])!, live.current.get(ids[1])!], g.base) };
      } else {
        const from = g.start.get(ids[0]);
        const to = live.current.get(ids[0]);
        if (!from || !to) return;
        next = { ...g.base, x: g.base.x + (to.x - from.x) / width, y: g.base.y + (to.y - from.y) / width };
      }
      const list = [...latest.current];
      list[g.index] = clampPlacement(next, ratio);
      onChange(list);
    };
    // A second finger anywhere on the screen turns a drag into a pinch.
    const down = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.mode !== "move" || live.current.has(e.pointerId) || live.current.size !== 1) return;
      live.current.set(e.pointerId, at(e, g.origin));
      restart(g);
    };
    const up = (e: PointerEvent) => {
      if (!live.current.delete(e.pointerId)) return;
      const g = gesture.current;
      if (!g) return;
      if (live.current.size === 0) gesture.current = null;
      else restart(g);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [width, ratio, onChange]);

  const begin = (e: React.PointerEvent, index: number, mode: Gesture["mode"]) => {
    e.stopPropagation();
    e.preventDefault();
    // A second finger landing on the sticker already being dragged joins it as a pinch. React's
    // stopPropagation above also hides this event from the window "down" listener, so it is done here.
    const g = gesture.current;
    if (g && g.mode === "move" && mode === "move" && g.index === index && live.current.size === 1 && !live.current.has(e.pointerId)) {
      live.current.set(e.pointerId, { x: e.clientX - g.origin.left, y: e.clientY - g.origin.top });
      g.base = latest.current[index];
      g.start = new Map(live.current);
      return;
    }
    onSelect(index);
    const origin = layer.current!.getBoundingClientRect();
    live.current = new Map([[e.pointerId, { x: e.clientX - origin.left, y: e.clientY - origin.top }]]);
    gesture.current = { index, mode, base: latest.current[index], start: new Map(live.current), origin };
  };

  return (
    <div ref={layer} className="pointer-events-none absolute inset-0">
      {placed.map((s, i) => {
        const src = srcs[s.id];
        if (!src) return null;
        const size = s.scale * width;
        return (
          <div key={i} data-sticker className="pointer-events-auto absolute" onPointerDown={(e) => begin(e, i, "move")}
            style={{ left: s.x * width - size / 2, top: s.y * width - size / 2, width: size, height: size, transform: `rotate(${s.rot}deg)`, touchAction: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" draggable={false} className={`size-full object-contain ${styles.sticker}`} />
            {i === selected && (
              <>
                <span className="pointer-events-none absolute -inset-1 rounded border-2 border-dashed border-white" />
                <button type="button" aria-label="Remove sticker" onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { onChange(placed.filter((_, j) => j !== i)); onSelect(null); }}
                  className="absolute -right-3 -top-3 flex size-7 items-center justify-center rounded-full bg-black text-white shadow">
                  <X className="size-4" />
                </button>
                <span role="button" aria-label="Resize or rotate" onPointerDown={(e) => begin(e, i, "handle")}
                  className="absolute -bottom-3 -right-3 size-7 rounded-full border-2 border-black bg-white shadow" style={{ touchAction: "none" }} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
