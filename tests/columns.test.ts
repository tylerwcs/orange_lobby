import { describe, expect, it } from "vitest";
import { allColumns, BUILTIN_COLUMNS, columnsCookieName, hiddenFromCookie, hiddenToCookie, visibleColumns } from "@/lib/columns";
import type { AttendeeField } from "@/lib/attendee-fields";

const fields: AttendeeField[] = [
  { key: "room_no", label: "Room no", type: "text" },
  { key: "dietary", label: "Dietary", type: "select", options: ["Halal"] },
];

describe("allColumns", () => {
  it("puts the built-ins first and the event's own columns after, and never offers Name", () => {
    const cols = allColumns(fields);
    expect(cols.map((c) => c.key)).toEqual([...BUILTIN_COLUMNS.map((c) => c.key), "room_no", "dietary"]);
    expect(cols.some((c) => c.key === "name")).toBe(false);
  });

  it("marks only the event's own columns as renameable", () => {
    expect(allColumns(fields).filter((c) => c.custom).map((c) => c.label)).toEqual(["Room no", "Dietary"]);
  });
});

describe("hiddenFromCookie", () => {
  const cols = allColumns(fields);

  it("reads nothing from an absent cookie", () => {
    expect(hiddenFromCookie(undefined, cols)).toEqual([]);
    expect(hiddenFromCookie("", cols)).toEqual([]);
  });

  it("keeps only keys that are still columns", () => {
    expect(hiddenFromCookie("source, dietary , gone_column", cols)).toEqual(["source", "dietary"]);
  });

  it("de-duplicates", () => {
    expect(hiddenFromCookie("source,source", cols)).toEqual(["source"]);
  });

  it("round-trips through hiddenToCookie", () => {
    const hidden = ["source", "category"];
    expect(hiddenFromCookie(hiddenToCookie(hidden), cols).sort()).toEqual(hidden.sort());
  });
});

describe("visibleColumns", () => {
  it("drops the hidden ones and keeps the order", () => {
    const cols = allColumns(fields);
    expect(visibleColumns(cols, ["email", "room_no"]).map((c) => c.key)).toEqual(["company", "category", "table_no", "checked_in", "source", "dietary"]);
  });
});

describe("columnsCookieName", () => {
  it("is scoped to the event, so hiding a column on one does not hide it on another", () => {
    expect(columnsCookieName("a")).not.toBe(columnsCookieName("b"));
  });
});
