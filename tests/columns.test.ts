import { describe, expect, it } from "vitest";
import {
  allColumns, bulkFields, BULK_BUILTIN_FIELDS, BUILTIN_COLUMNS, columnsCookieName, defaultHidden,
  hiddenFromCookie, hiddenToCookie, parseTablePrefs, serialiseTablePrefs, tableCookieName,
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
    expect(visibleColumns(cols, ["email", "room_no"]).map((c) => c.key)).toEqual(["company", "phone", "category", "table_no", "checked_in", "source", "shirt_size", "dietary"]);
  });
});

describe("columnsCookieName", () => {
  it("is scoped to the event, so hiding a column on one does not hide it on another", () => {
    expect(columnsCookieName("a")).not.toBe(columnsCookieName("b"));
  });
});

describe("parseTablePrefs", () => {
  const round = (prefs: Parameters<typeof serialiseTablePrefs>[0]) => parseTablePrefs(serialiseTablePrefs(prefs), cols);

  it("round-trips the hidden columns", () => {
    expect(round({ hidden: ["source"] })).toEqual({ hidden: ["source"] });
  });

  it("starts with only the attendee's own columns shown", () => {
    // Fifteen columns is what a seven-question registration form produces; six is what
    // someone can actually read. The rest are one tick away in the Columns menu.
    expect(parseTablePrefs(undefined, cols).hidden).toEqual(defaultHidden(cols));
    expect(parseTablePrefs(undefined, cols).hidden).toEqual(["email", "phone", "source", "shirt_size", "room_no", "dietary"]);
  });

  it("treats an empty stored layout as a deliberate show-everything", () => {
    // Distinct from having no cookie at all: once someone opens the Columns menu their
    // choice is recorded, and "I want all of them" must survive a reload.
    expect(parseTablePrefs(serialiseTablePrefs({ hidden: [] }), cols)).toEqual({ hidden: [] });
  });

  it("returns an empty layout for anything unreadable", () => {
    const empty = { hidden: [] };
    expect(parseTablePrefs("not json", cols)).toEqual(empty);
    expect(parseTablePrefs(encodeURIComponent('"a string"'), cols)).toEqual(empty);
    expect(parseTablePrefs(encodeURIComponent("[1,2]"), cols)).toEqual(empty);
  });

  it("reads the older hide-only cookie when the layout cookie is absent", () => {
    expect(parseTablePrefs(undefined, cols, "source,dietary")).toEqual({ hidden: ["source", "dietary"] });
  });

  it("drops keys that are no longer columns", () => {
    expect(round({ hidden: ["gone"] })).toEqual({ hidden: [] });
  });

  it("never hides Name — the row would have nothing left to open", () => {
    expect(round({ hidden: ["name"] }).hidden).toEqual([]);
  });

  it("de-duplicates", () => {
    expect(round({ hidden: ["source", "source"] })).toEqual({ hidden: ["source"] });
  });

  // Column order and per-column widths were stored here until the shadcn revamp dropped
  // both. An organiser who tuned their table before that still has a cookie carrying them,
  // and it must keep working rather than resetting their hidden columns.
  it("ignores order and widths left behind by an older cookie", () => {
    const legacy = encodeURIComponent(JSON.stringify({
      hidden: ["source"],
      order: ["dietary", "email"],
      widths: { email: 300 },
    }));
    expect(parseTablePrefs(legacy, cols)).toEqual({ hidden: ["source"] });
  });
});

describe("tableCookieName", () => {
  it("is scoped to the event and distinct from the older one", () => {
    expect(tableCookieName("a")).not.toBe(tableCookieName("b"));
    expect(tableCookieName("a")).not.toBe(columnsCookieName("a"));
  });
});

describe("breakout rounds as table columns", () => {
  const rounds: AttendeeField[] = [
    { key: "breakout:Breakout 1", label: "Breakout 1", type: "select", options: ["3A", "3B"] },
  ];

  it("adds a column per round, after the organiser's own", () => {
    const out = allColumns(registration, fields, rounds);
    expect(out[out.length - 1]).toEqual({ key: "breakout:Breakout 1", label: "Breakout 1", source: "breakout" });
  });

  it("leaves the columns unchanged for an event with no rounds", () => {
    expect(allColumns(registration, fields, [])).toEqual(allColumns(registration, fields));
  });

  it("shows a round by default, unlike every other non-built-in column", () => {
    // The whole point of the column is to see who is in which room without opening anyone,
    // so starting hidden would be the same as not having it.
    expect(defaultHidden(allColumns(registration, fields, rounds))).not.toContain("breakout:Breakout 1");
  });

  it("still hides the organiser's own columns by default", () => {
    expect(defaultHidden(allColumns(registration, fields, rounds))).toContain(fields[0].key);
  });
});

describe("fields an event does not collect", () => {
  it("has no column at all, rather than a hidden one", () => {
    // Hidden would be something you could tick back on by accident, with nothing behind it.
    const keys = allColumns(registration, fields, [], ["company"]).map((c) => c.key);
    expect(keys).toContain("company");
    expect(keys).not.toContain("phone");
    expect(keys).not.toContain("table_no");
  });

  it("leaves the fields that carry behaviour alone, whatever is collected", () => {
    // email is the import's matching key and category decides who sees which sessions, so
    // neither is ever switchable.
    const keys = allColumns(registration, fields, [], []).map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(["email", "category", "checked_in", "source"]));
  });

  it("drops an uncollected field from the bulk editor too", () => {
    expect(bulkFields(fields, ["category" as never]).map((f) => f.key)).not.toContain("table_no");
  });

  it("collects all three when nothing is said, so an un-migrated event is unchanged", () => {
    expect(allColumns(registration, fields).map((c) => c.key)).toEqual(allColumns(registration, fields, [], ["company", "phone", "table_no"]).map((c) => c.key));
  });
});
