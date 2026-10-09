import { describe, expect, it } from "vitest";
import { GRID_WIDTH, LINE, winnerGrid } from "@/features/games/components/display/winnerGrid";

const HEIGHTS = [816, 912];

describe("winnerGrid", () => {
  it("never runs off the 1920×1080 LED, from 2 winners to 500 (D282)", () => {
    for (const height of HEIGHTS) {
      for (let n = 1; n <= 500; n++) {
        const g = winnerGrid(n, height);
        expect(g.rows * g.cellHeight + (g.rows - 1) * g.gap).toBeLessThanOrEqual(height);
        expect(g.cols * g.gap).toBeLessThan(GRID_WIDTH);
        expect(g.rows * g.cols).toBeGreaterThanOrEqual(g.perPage);
        expect(g.perPage).toBeLessThanOrEqual(n);
        // A cell is tall enough for its lines and padding.
        expect(g.cellHeight).toBeGreaterThanOrEqual(2 * g.pad + LINE * g.font * (g.company ? 1.6 : 1));
        // And wide enough for a name of about 16 characters.
        expect((GRID_WIDTH - (g.cols - 1) * g.gap) / g.cols).toBeGreaterThanOrEqual(9 * g.font + 2 * g.pad);
      }
    }
  });

  it("keeps the big type and the company line for a few winners", () => {
    const g = winnerGrid(3, 816);
    expect(g.font).toBe(56);
    expect(g.company).toBe(true);
    expect(g.perPage).toBe(3);
  });

  it("shows a Voucher ×20 on one page with companies", () => {
    const g = winnerGrid(20, 816);
    expect(g.perPage).toBe(20);
    expect(g.company).toBe(true);
    expect(g.font).toBeGreaterThanOrEqual(36);
  });

  it("drops the company line before the names get too small, then pages", () => {
    const hundred = winnerGrid(100, 816);
    expect(hundred.perPage).toBe(100);
    expect(hundred.font).toBeGreaterThanOrEqual(20);
    const many = winnerGrid(500, 816);
    expect(many.company).toBe(false);
    expect(many.font).toBeLessThanOrEqual(24);
    expect(many.perPage).toBe(125);
    expect(winnerGrid(150, 816).perPage).toBe(75);
  });
});
