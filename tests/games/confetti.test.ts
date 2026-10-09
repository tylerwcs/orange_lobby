import { describe, expect, it } from "vitest";
import { stepPiece, type ConfettiPiece } from "@/features/games/confetti";

const piece = (over: Partial<ConfettiPiece> = {}): ConfettiPiece => ({
  x: 0, y: 0, z: 0, vy: 200, vx: 30, spin: 4, rx: 0, ry: 0, ...over,
});

describe("confetti stepping (D305, D306)", () => {
  it("caps a huge dt so a piece never jumps far in one step", () => {
    const p = piece({ y: 500, x: 500 });
    stepPiece(p, 600); // a demand-render canvas waking from idle could report this
    // Capped at 0.05 s: at most 200 * 0.05 = 10 down, 30 * 0.05 = 1.5 across.
    expect(p.y).toBeGreaterThan(489);
    expect(Math.abs(p.x - 501.5)).toBeLessThan(0.001);
  });

  it("wraps y back into the fall band after many huge-dt steps", () => {
    const p = piece({ y: 1600 });
    for (let i = 0; i < 500; i++) stepPiece(p, 600);
    expect(p.y).toBeGreaterThanOrEqual(-600);
    expect(p.y).toBeLessThanOrEqual(1700);
  });

  it("wraps x back onto the LED instead of drifting off the sides forever", () => {
    const p = piece({ x: 999, vx: 30 });
    for (let i = 0; i < 2000; i++) stepPiece(p, 0.5);
    expect(p.x).toBeGreaterThanOrEqual(-1000);
    expect(p.x).toBeLessThanOrEqual(1000);
  });

  it("stays within bounds under many small, ordinary-frame steps too", () => {
    const p = piece({ x: -950, y: 1200, vx: -25, vy: 300 });
    for (let i = 0; i < 5000; i++) stepPiece(p, 1 / 60);
    expect(p.x).toBeGreaterThanOrEqual(-1000);
    expect(p.x).toBeLessThanOrEqual(1000);
    expect(p.y).toBeGreaterThanOrEqual(-600);
    expect(p.y).toBeLessThanOrEqual(1700);
  });

  it("every piece in a fleet stays in bounds after a mix of huge and small steps", () => {
    const pieces = Array.from({ length: 260 }, (_, i) =>
      piece({ x: (((i * 373) % 1000) / 1000 - 0.5) * 1920, y: 560 + ((i * 617) % 1000) * 1.1, vx: ((i % 100) / 100 - 0.5) * 60, vy: 180 + (i % 220) }));
    for (let round = 0; round < 50; round++) {
      const dt = round % 7 === 0 ? 600 : 1 / 60;
      for (const p of pieces) stepPiece(p, dt);
    }
    for (const p of pieces) {
      expect(p.x).toBeGreaterThanOrEqual(-1000);
      expect(p.x).toBeLessThanOrEqual(1000);
      expect(p.y).toBeGreaterThanOrEqual(-600);
      expect(p.y).toBeLessThanOrEqual(1700);
    }
  });

  it("keeps spinning and returns the same piece object", () => {
    const p = piece({ rx: 0, ry: 0, spin: 2 });
    const returned = stepPiece(p, 1 / 60);
    expect(returned).toBe(p);
    expect(p.rx).toBeCloseTo(2 / 60);
    expect(p.ry).toBeCloseTo((2 * 0.7) / 60);
  });
});
