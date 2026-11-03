"use client";
import { useEffect, useRef } from "react";
import { SLIMES, css } from "../../game/palette";

/** How long the show runs, s; the last pieces finish falling after it. */
const RUN_S = 4.5;
const GRAVITY = 900;

type Piece = { x: number; y: number; vx: number; vy: number; size: number; color: string; spin: number; a: number; life: number; age: number; spark: boolean };

/**
 * Confetti or fireworks over the game (D816), on a canvas filling its parent: confetti for a new
 * best, fireworks for beating the last boss. In the slime colours. A few seconds, then it stops;
 * nothing at all with reduced motion.
 */
export function Celebrate({ kind }: { kind: "confetti" | "fireworks" }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const c = el?.getContext("2d");
    if (!el || !c || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0;
    const size = () => {
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const colours = SLIMES.map((s) => css(s));
    const pick = () => colours[Math.floor(Math.random() * colours.length)];
    const pieces: Piece[] = [];

    const confetti = (n: number) => {
      for (let i = 0; i < n; i++) {
        pieces.push({
          x: Math.random() * w, y: -20 - Math.random() * h * 0.5, vx: (Math.random() - 0.5) * 120, vy: 80 + Math.random() * 160,
          size: 7 + Math.random() * 7, color: pick(), spin: (Math.random() - 0.5) * 12, a: Math.random() * 6, life: 6, age: 0, spark: false,
        });
      }
    };
    const burst = () => {
      const x = w * (0.15 + Math.random() * 0.7);
      const y = h * (0.12 + Math.random() * 0.3);
      const color = pick();
      const n = 36;
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2;
        const speed = 160 + Math.random() * 180;
        pieces.push({
          x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 3 + Math.random() * 2,
          color, spin: 0, a: 0, life: 1.4 + Math.random() * 0.5, age: 0, spark: true,
        });
      }
    };

    if (kind === "confetti") confetti(140);
    let next = 0;
    let t = 0;
    let last = performance.now();
    let raf = 0;
    const frame = () => {
      const now = performance.now();
      const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
      last = now;
      t += dt;
      if (kind === "fireworks" && t < RUN_S && t >= next) {
        burst();
        next = t + 0.35 + Math.random() * 0.4;
      }
      c.clearRect(0, 0, w, h);
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        p.age += dt;
        if (p.spark) {
          p.vx *= 1 - 1.6 * dt;
          p.vy = p.vy * (1 - 1.6 * dt) + GRAVITY * 0.25 * dt;
        } else {
          p.vx += Math.sin(p.age * 2 + p.a) * 30 * dt;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.a += p.spin * dt;
        if (p.age > p.life || p.y > h + 30) {
          pieces.splice(i, 1);
          continue;
        }
        c.globalAlpha = p.spark ? Math.max(0, 1 - p.age / p.life) : 1;
        c.fillStyle = p.color;
        if (p.spark) {
          c.beginPath();
          c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          c.fill();
        } else {
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.a);
          c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          c.restore();
        }
      }
      c.globalAlpha = 1;
      if (pieces.length > 0 || t < RUN_S) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", size);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
    };
  }, [kind]);

  return <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 size-full" />;
}
