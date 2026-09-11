import { describe, it, expect } from "vitest";
import { moveItem } from "@/lib/reorder";

const list = ["a", "b", "c", "d"];

describe("moveItem", () => {
  it("moves an item later", () => {
    expect(moveItem(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item earlier", () => {
    expect(moveItem(list, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("moving onto itself changes nothing", () => {
    expect(moveItem(list, 2, 2)).toEqual(list);
  });

  it("does not mutate the input", () => {
    const original = [...list];
    moveItem(list, 0, 3);
    expect(list).toEqual(original);
  });

  it("clamps a target past either end rather than dropping the item", () => {
    expect(moveItem(list, 0, 99)).toEqual(["b", "c", "d", "a"]);
    expect(moveItem(list, 3, -5)).toEqual(["d", "a", "b", "c"]);
  });

  it("returns the list unchanged when the source index is not in it", () => {
    expect(moveItem(list, 9, 0)).toEqual(list);
    expect(moveItem(list, -1, 0)).toEqual(list);
  });

  it("handles a single-item and an empty list", () => {
    expect(moveItem(["only"], 0, 1)).toEqual(["only"]);
    expect(moveItem([], 0, 0)).toEqual([]);
  });
});
