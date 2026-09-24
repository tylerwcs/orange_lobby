import { describe, it, expect } from "vitest";
import { itemKey, rowKey, rowTime, placeKey, sortOrdersFor, isValidOrder } from "@/lib/agenda-placement";
import { agendaRows } from "@/lib/breakouts";
import type { AgendaItem } from "@/lib/types";

const mk = (p: Partial<AgendaItem>): AgendaItem => ({
  id: "x", event_id: "e", day_id: "d1", day: "2026-09-30", kind: "session", starts_at: "09:00", ends_at: null,
  title: "t", description: null, location: null, categories: null, slot: null, code: null, color: null,
  image_url: null, sort_order: 0, ...p,
});
const img = (p: Partial<AgendaItem>) => mk({ kind: "image", starts_at: null, image_url: "https://x/y.png", ...p });
const rowsOf = (...items: AgendaItem[]) => agendaRows(items.map((i, n) => ({ ...i, sort_order: i.sort_order || (n + 1) * 10 })));

describe("keys", () => {
  it("names a session by its id and a round by its slot, from either side", () => {
    const room = mk({ id: "r1", slot: " Breakout 1 ", code: "3A" });
    const [row] = agendaRows([room]);
    expect(itemKey(room)).toBe("slot:Breakout 1");
    expect(rowKey(row)).toBe("slot:Breakout 1");
    expect(itemKey(mk({ id: "s1" }))).toBe("s1");
  });

  it("gives an image row no time", () => {
    const [row] = agendaRows([img({ id: "i" })]);
    expect(rowTime(row)).toBeNull();
  });
});

describe("placeKey", () => {
  it("puts a new session before the first later one", () => {
    const rows = rowsOf(mk({ id: "a", starts_at: "09:00" }), mk({ id: "b", starts_at: "12:00" }));
    expect(placeKey(rows, "n", "10:00")).toEqual(["a", "n", "b"]);
  });

  it("skips images when comparing, so the new row lands after an image that precedes its neighbour", () => {
    const rows = rowsOf(mk({ id: "a", starts_at: "09:00" }), img({ id: "i" }), mk({ id: "b", starts_at: "12:00" }));
    expect(placeKey(rows, "n", "10:00")).toEqual(["a", "i", "n", "b"]);
    expect(placeKey(rows, "n", "13:00")).toEqual(["a", "i", "b", "n"]);
  });

  it("moves a retimed row that is already in the day", () => {
    const rows = rowsOf(mk({ id: "a", starts_at: "09:00" }), mk({ id: "b", starts_at: "10:00" }), mk({ id: "c", starts_at: "11:00" }));
    expect(placeKey(rows, "a", "10:30")).toEqual(["b", "a", "c"]);
  });

  it("goes after a row at the same time", () => {
    const rows = rowsOf(mk({ id: "a", starts_at: "09:00" }));
    expect(placeKey(rows, "n", "09:00")).toEqual(["a", "n"]);
  });

  it("sends a row with no time (an image) to the end", () => {
    const rows = rowsOf(mk({ id: "a", starts_at: "09:00" }), mk({ id: "b", starts_at: "12:00" }));
    expect(placeKey(rows, "i", null)).toEqual(["a", "b", "i"]);
  });

  it("handles an empty day", () => {
    expect(placeKey([], "n", "09:00")).toEqual(["n"]);
  });

  it("places a whole round by its key", () => {
    const rows = rowsOf(mk({ id: "a", starts_at: "09:00" }), mk({ id: "r1", slot: "B1", code: "3A", starts_at: "15:00" }), mk({ id: "b", starts_at: "12:00" }));
    expect(placeKey(rows, "slot:B1", "10:00")).toEqual(["a", "slot:B1", "b"]);
  });
});

describe("sortOrdersFor", () => {
  it("numbers rows 10 apart, every room of a round sharing its row's number", () => {
    const rows = agendaRows([
      mk({ id: "a", sort_order: 1 }),
      mk({ id: "r1", slot: "B1", code: "3A", sort_order: 2 }),
      mk({ id: "r2", slot: "B1", code: "3B", sort_order: 2 }),
    ]);
    const out = sortOrdersFor(rows, ["slot:B1", "a"]);
    expect(Object.fromEntries(out)).toEqual({ r1: 10, r2: 10, a: 20 });
  });

  it("ignores a key that is not one of the rows", () => {
    const rows = agendaRows([mk({ id: "a" })]);
    expect(Object.fromEntries(sortOrdersFor(rows, ["ghost", "a"]))).toEqual({ a: 20 });
  });
});

describe("isValidOrder", () => {
  const current = ["a", "b", "slot:B1"];
  it("accepts the same rows in another order", () => {
    expect(isValidOrder(current, ["slot:B1", "a", "b"])).toBe(true);
  });
  it("refuses a list with a row missing, added, repeated or foreign", () => {
    expect(isValidOrder(current, ["a", "b"])).toBe(false);
    expect(isValidOrder(current, ["a", "b", "slot:B1", "c"])).toBe(false);
    expect(isValidOrder(current, ["a", "a", "b"])).toBe(false);
    expect(isValidOrder(current, ["a", "b", "zzz"])).toBe(false);
  });
});
