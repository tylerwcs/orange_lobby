"use client";
import { useEffect, useRef, useState } from "react";
import type { Reveal } from "../../lib/booths";
import { PaperDisc, StampInk } from "./StampDisc";

// The outline's circle, in the SVG's own units: a 252-unit box drawn 6px outside the disc.
const R = 122;
const C = 2 * Math.PI * R;
const GOLD_FROM = "#C08552";
const GOLD_TO = "#F0C88E";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Runs `frame` with an eased 0..1 for `ms`, unless `alive()` turns false first. */
function tween(ms: number, frame: (p: number) => void, alive: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      if (!alive()) return resolve();
      const t = Math.min(1, (now - start) / ms);
      frame(ease(t));
      if (t < 1) requestAnimationFrame(step); else resolve();
    };
    requestAnimationFrame(step);
  });
}

/** The slot the stamp lands in: a round slot's face, or a box cell whole (`data-booth-slot`, D850). */
function slotFor(boothId: string): { el: HTMLElement; deg: number } | null {
  const slot = document.querySelector<HTMLElement>(`[data-booth-slot="${CSS.escape(boothId)}"]`);
  if (!slot) return null;
  const face = slot.querySelector<HTMLElement>("[data-slot-face]") ?? slot;
  return { el: face, deg: Number(face.dataset.deg ?? 0) };
}

/**
 * D853: one stamp's arrival, "grow from centre". The page dims, a round piece of the passport's
 * paper appears (D858), a gold outline draws once around it from 12 o'clock with a glowing dot
 * leading, the artwork spreads out from the middle, its name shows, then it moves into its slot. Reduced motion skips straight to
 * the slot with the name shown for a moment. A tap, or Escape, lands it at once - several stamps
 * replaying must never lock the page. `onDone` is called exactly once, when it has landed.
 */
export function StampReveal({ reveal, onDone, brand }: { reveal: Reveal | null; onDone: (r: Reveal) => void; brand: string | null }) {
  const [shown, setShown] = useState<Reveal | null>(null);
  const [stage, setStage] = useState<"in" | "lit" | "named" | "out">("in");
  const box = useRef<HTMLDivElement>(null);
  const trace = useRef<SVGCircleElement>(null);
  const spark = useRef<SVGCircleElement>(null);
  const done = useRef(onDone);
  const skip = useRef<(() => void) | null>(null);
  useEffect(() => { done.current = onDone; }, [onDone]);

  useEffect(() => {
    if (!reveal) return;
    let alive = true;
    const isAlive = () => alive;
    const r = reveal;
    // Every way out goes through here, so `onDone` runs once whether it played through or was skipped.
    const finish = () => {
      if (!alive) return;
      alive = false;
      skip.current = null;
      setShown(null);
      done.current(r);
    };
    skip.current = finish;

    const run = async () => {
      setShown(r);
      setStage("in");
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setStage("named");
        await wait(1200);
        finish();
        return;
      }

      const art = () => box.current?.querySelector<HTMLElement>("img, [role=img]") ?? null;
      const mask = (pct: number) => {
        const el = art();
        if (!el) return;
        const m = pct >= 100 ? "none" : `radial-gradient(circle at 50% 50%, #000 ${pct}%, transparent ${pct + 8}%)`;
        el.style.maskImage = m;
        el.style.webkitMaskImage = m;
      };
      const draw = (p: number) => {
        if (trace.current) trace.current.style.strokeDashoffset = String(C * (1 - p));
        if (spark.current) {
          const a = -Math.PI / 2 + p * 2 * Math.PI;
          spark.current.setAttribute("cx", String(126 + R * Math.cos(a)));
          spark.current.setAttribute("cy", String(126 + R * Math.sin(a)));
          spark.current.style.opacity = p > 0 && p < 1 ? "1" : "0";
        }
      };

      // One frame with everything at its start, then the scrim and the disc come in.
      await new Promise((res) => requestAnimationFrame(() => res(null)));
      if (!alive) return;
      mask(0);
      draw(0);
      setStage("lit");
      await wait(450);
      if (!alive) return;
      await tween(900, draw, isAlive);
      await tween(700, (p) => mask(p * 75), isAlive);
      if (!alive) return;
      mask(100);
      setStage("named");
      await wait(1500);
      if (!alive || !box.current) return;

      const target = slotFor(r.boothId);
      if (target) {
        target.el.scrollIntoView({ block: "center", behavior: "smooth" });
        await wait(350);
        if (!alive || !box.current) return;
        const from = box.current.getBoundingClientRect();
        const to = target.el.getBoundingClientRect();
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        const scale = (Math.min(to.width, to.height) * 0.94) / from.width;
        box.current.style.transition = "transform 550ms cubic-bezier(0.65, 0, 0.35, 1)";
        box.current.style.transform = `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${target.deg}deg)`;
      }
      setStage("out");
      await wait(560);
      finish();
    };
    void run();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    return () => { alive = false; skip.current = null; window.removeEventListener("keydown", onKey); };
  }, [reveal]);

  if (!shown) return null;
  const lit = stage !== "in";
  return (
    <div className="fixed inset-0 z-50 cursor-pointer" aria-live="polite" onClick={() => skip.current?.()}>
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{ background: "rgba(0, 4, 20, 0.75)", opacity: stage === "lit" || stage === "named" ? 1 : 0 }}
      />
      <div className="absolute inset-x-0 top-[40%] flex -translate-y-1/2 flex-col items-center gap-5">
        <div
          ref={box}
          className="relative size-60 max-w-[64vw] max-h-[64vw] transition-[opacity,transform] duration-300 ease-out"
          style={{ opacity: lit ? 1 : 0, transform: lit ? undefined : "scale(0.9)" }}
        >
          <PaperDisc brand={brand}><StampInk image={shown.image} name={shown.name} deg={0} /></PaperDisc>
          <svg viewBox="0 0 252 252" aria-hidden="true" className="pointer-events-none absolute -inset-1.5 size-[calc(100%+0.75rem)] overflow-visible" style={{ opacity: stage === "out" ? 0 : 1, transition: "opacity 300ms" }}>
            <defs>
              <linearGradient id="stamp-reveal-gold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={GOLD_FROM} />
                <stop offset="1" stopColor={GOLD_TO} />
              </linearGradient>
            </defs>
            <circle ref={trace} cx="126" cy="126" r={R} fill="none" stroke="url(#stamp-reveal-gold)" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C} transform="rotate(-90 126 126)" />
            <circle ref={spark} r="6" fill="#FFE7B8" opacity="0" style={{ filter: "drop-shadow(0 0 6px #FFD38A) drop-shadow(0 0 12px #FFB84D)" }} />
          </svg>
        </div>
        <div
          className="text-center transition-[opacity,transform] duration-300"
          style={{ opacity: stage === "named" ? 1 : 0, transform: stage === "named" ? "none" : "translateY(8px)", color: "#fff" }}
        >
          <div className="text-lg font-extrabold">{shown.name}</div>
          <div className="text-sm font-medium opacity-85">Stamp collected</div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-8 text-center text-xs font-semibold" style={{ color: "rgba(255, 255, 255, 0.7)", opacity: stage === "lit" || stage === "named" ? 1 : 0 }}>
        Tap to skip
      </div>
    </div>
  );
}
