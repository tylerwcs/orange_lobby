import { describe, it, expect } from "vitest";
import { paginate } from "@/lib/paginate";

const rows = Array.from({ length: 98 }, (_, i) => i + 1);

describe("paginate", () => {
  it("slices a page", () => {
    expect(paginate(rows, 1, 50).slice).toHaveLength(50);
    expect(paginate(rows, 1, 50).slice[0]).toBe(1);
    expect(paginate(rows, 2, 50).slice).toHaveLength(48);
    expect(paginate(rows, 2, 50).slice[0]).toBe(51);
  });

  it("reports the page count", () => {
    expect(paginate(rows, 1, 50).pages).toBe(2);
    expect(paginate(rows, 1, 100).pages).toBe(1);
  });

  it("clamps a page below the first or past the last", () => {
    expect(paginate(rows, 0, 50).page).toBe(1);
    expect(paginate(rows, -3, 50).page).toBe(1);
    expect(paginate(rows, 99, 50).page).toBe(2);
  });

  it("survives an empty list", () => {
    expect(paginate([], 1, 50)).toEqual({ slice: [], page: 1, pages: 1 });
  });

  it("survives a non-numeric page", () => {
    expect(paginate(rows, Number.NaN, 50).page).toBe(1);
  });
});
