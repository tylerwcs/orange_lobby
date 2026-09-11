import { describe, expect, it } from "vitest";
import {
  allColumns, bulkFields, BULK_BUILTIN_FIELDS, BUILTIN_COLUMNS, columnsCookieName, columnWidth,
  DEFAULT_COLUMN_WIDTH, DEFAULT_WIDTHS, hiddenFromCookie, hiddenToCookie, MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH, orderedColumns, parseTablePrefs, serialiseTablePrefs, tableCookieName,
  visibleColumns,
} from "@/lib/columns";
import type { AttendeeField } from "@/lib/attendee-fields";

const registration: AttendeeField[] = [
  { key: "shirt_size", label: "Shirt size", type: "text" },
];

const fields: AttendeeField[] = [
  { key: "room_no", label: "Room no", type: "text" },
  { key: "dietary", label: "Dietary", type: "select", options: ["Halal"] },
];

const cols = allColumns(registration, fields);

describe("allColumns", () => {
  it("reads built-ins, then the registration form's questions, then the organiser's own — and never offers Name", () => {
    expect(cols.map((c) => c.key)).toEqual([...BUILTIN_COLUMNS.map((c) => c.key), "shirt_size", "room_no", "dietary"]);
    expect(cols.some((c) => c.key === "name")).toBe(false);
  });

  it("marks only the organiser's own columns as renameable", () => {
    expect(cols.filter((c) => c.source === "custom").map((c) => c.label)).toEqual(["Room no", "Dietary"]);
    expect(cols.filter((c) => c.source === "registration").map((c) => c.label)).toEqual(["Shirt size"]);
  });

  it("lets the registration form win when a custom column shares its key, so the column is not doubled", () => {
    const clash: AttendeeField[] = [{ key: "shirt_size", label: "Shirt size", type: "text" }];
    const out = allColumns(registration, clash);
    expect(out.filter((c) => c.key === "shirt_size")).toHaveLength(1);
    expect(out.find((c) => c.key === "shirt_size")?.source).toBe("registration");
  });
});

describe("bulkFields", () => {
  it("offers the three built-ins worth setting in bulk, then every event column", () => {
    expect(bulkFields(fields).map((f) => f.key)).toEqual([...BULK_BUILTIN_FIELDS.map((f) => f.key), "room_no", "dietary"]);
  });

  it("never offers name, email, phone, check-in or source", () => {
    const keys = bulkFields(fields).map((f) => f.key);
    for (const k of ["name", "email", "phone", "checked_in", "source"]) expect(keys).not.toContain(k);
  });
});

describe("hiddenFromCookie", () => {
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
    expect(visibleColumns(cols, ["email", "room_no"]).map((c) => c.key)).toEqual(["company", "category", "table_no", "checked_in", "source", "shirt_size", "dietary"]);
  });
});

describe("columnsCookieName", () => {
  it("is scoped to the event, so hiding a column on one does not hide it on another", () => {
    expect(columnsCookieName("a")).not.toBe(columnsCookieName("b"));
  });
});

describe("orderedColumns", () => {
  it("puts the placed columns first, in the order given", () => {
    expect(orderedColumns(cols, ["dietary", "table_no"]).slice(0, 2).map((c) => c.key)).toEqual(["dietary", "table_no"]);
  });

  it("keeps a column the stored order never mentioned, at the end", () => {
    // A question added to the registration form after someone arranged their table must
    // appear, not vanish because an old preference did not know about it.
    const out = orderedColumns(cols, ["email"]);
    expect(out[0].key).toBe("email");
    expect(out.map((c) => c.key)).toContain("shirt_size");
    expect(out).toHaveLength(cols.length);
  });

  it("ignores a stored key that is no longer a column", () => {
    expect(orderedColumns(cols, ["deleted_column", "email"])[0].key).toBe("email");
  });
});

describe("columnWidth", () => {
  it("falls back to the column's own default, then the generic one", () => {
    expect(columnWidth("table_no", {})).toBe(DEFAULT_WIDTHS.table_no);
    expect(columnWidth("dietary", {})).toBe(DEFAULT_COLUMN_WIDTH);
    expect(columnWidth("dietary", { dietary: 300 })).toBe(300);
  });
});

describe("parseTablePrefs", () => {
  const round = (prefs: Parameters<typeof serialiseTablePrefs>[0]) => parseTablePrefs(serialiseTablePrefs(prefs), cols);

  it("round-trips a layout", () => {
    const prefs = { hidden: ["source"], order: ["dietary", "email"], widths: { email: 300 } };
    expect(round(prefs)).toEqual(prefs);
  });

  it("returns an empty layout for nothing, and for anything unreadable", () => {
    const empty = { hidden: [], order: [], widths: {} };
    expect(parseTablePrefs(undefined, cols)).toEqual(empty);
    expect(parseTablePrefs("not json", cols)).toEqual(empty);
    expect(parseTablePrefs(encodeURIComponent('"a string"'), cols)).toEqual(empty);
    expect(parseTablePrefs(encodeURIComponent("[1,2]"), cols)).toEqual(empty);
  });

  it("reads the older hide-only cookie when the layout cookie is absent", () => {
    expect(parseTablePrefs(undefined, cols, "source,dietary")).toEqual({ hidden: ["source", "dietary"], order: [], widths: {} });
  });

  it("drops keys that are no longer columns", () => {
    const got = round({ hidden: ["gone"], order: ["gone", "email"], widths: { gone: 200, email: 200 } });
    expect(got).toEqual({ hidden: [], order: ["email"], widths: { email: 200 } });
  });

  it("never hides Name — the row would have nothing left to open", () => {
    expect(round({ hidden: ["name"], order: [], widths: {} }).hidden).toEqual([]);
  });

  it("still lets Name be resized and ordered", () => {
    expect(round({ hidden: [], order: ["name"], widths: { name: 260 } })).toEqual({ hidden: [], order: ["name"], widths: { name: 260 } });
  });

  it("clamps a width that would make the table unreadable", () => {
    const got = round({ hidden: [], order: [], widths: { email: 4, company: 9000 } });
    expect(got.widths).toEqual({ email: MIN_COLUMN_WIDTH, company: MAX_COLUMN_WIDTH });
  });

  it("ignores a width that is not a number", () => {
    expect(parseTablePrefs(encodeURIComponent(JSON.stringify({ widths: { email: "wide", company: null } })), cols).widths).toEqual({});
  });

  it("de-duplicates", () => {
    expect(round({ hidden: ["source", "source"], order: ["email", "email"], widths: {} }))
      .toEqual({ hidden: ["source"], order: ["email"], widths: {} });
  });
});

describe("tableCookieName", () => {
  it("is scoped to the event and distinct from the older one", () => {
    expect(tableCookieName("a")).not.toBe(tableCookieName("b"));
    expect(tableCookieName("a")).not.toBe(columnsCookieName("a"));
  });
});
