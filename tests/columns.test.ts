import { describe, expect, it } from "vitest";
import {
  allColumns, bulkFields, BULK_BUILTIN_FIELDS, BUILTIN_COLUMNS, columnsCookieName, defaultHidden,
  hiddenFromCookie, hiddenToCookie, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, orderedColumns,
  parseTablePrefs, serialiseTablePrefs, tableCookieName, visibleColumns, type TablePrefs,
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
  it("offers the built-ins worth setting in bulk, then every event column", () => {
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
    expect(visibleColumns(cols, ["email", "room_no"]).map((c) => c.key)).toEqual(["category", "checked_in", "source", "shirt_size", "dietary"]);
  });
});

describe("columnsCookieName", () => {
  it("is scoped to the event, so hiding a column on one does not hide it on another", () => {
    expect(columnsCookieName("a")).not.toBe(columnsCookieName("b"));
  });
});

describe("parseTablePrefs", () => {
  const layout = (p: Partial<TablePrefs>): TablePrefs => ({ hidden: [], order: [], widths: {}, ...p });
  const round = (prefs: Partial<TablePrefs>) => parseTablePrefs(serialiseTablePrefs(layout(prefs)), cols);

  it("round-trips the hidden columns", () => {
    expect(round({ hidden: ["source"] })).toEqual(layout({ hidden: ["source"] }));
  });

  it("starts with only the attendee's own columns shown", () => {
    // Fifteen columns is what a seven-question registration form produces; six is what
    // someone can actually read. The rest are one tick away in the Columns menu.
    expect(parseTablePrefs(undefined, cols).hidden).toEqual(defaultHidden(cols));
    expect(parseTablePrefs(undefined, cols).hidden).toEqual(["email", "source", "shirt_size", "room_no", "dietary"]);
  });

  it("treats an empty stored layout as a deliberate show-everything", () => {
    // Distinct from having no cookie at all: once someone opens the Columns menu their
    // choice is recorded, and "I want all of them" must survive a reload.
    expect(round({})).toEqual(layout({}));
  });

  it("returns an empty layout for anything unreadable", () => {
    expect(parseTablePrefs("not json", cols)).toEqual(layout({}));
    expect(parseTablePrefs(encodeURIComponent('"a string"'), cols)).toEqual(layout({}));
    expect(parseTablePrefs(encodeURIComponent("[1,2]"), cols)).toEqual(layout({}));
  });

  it("reads the older hide-only cookie when the layout cookie is absent", () => {
    expect(parseTablePrefs(undefined, cols, "source,dietary")).toEqual(layout({ hidden: ["source", "dietary"] }));
  });

  it("drops keys that are no longer columns", () => {
    expect(round({ hidden: ["gone"], order: ["gone", "email"], widths: { gone: 200 } }))
      .toEqual(layout({ order: ["email"] }));
  });

  it("never hides Name — the row would have nothing left to open", () => {
    expect(round({ hidden: ["name"] }).hidden).toEqual([]);
  });

  it("de-duplicates", () => {
    expect(round({ hidden: ["source", "source"], order: ["email", "email"] }))
      .toEqual(layout({ hidden: ["source"], order: ["email"] }));
  });

  it("round-trips order and widths", () => {
    expect(round({ order: ["dietary", "email"], widths: { email: 300 } }))
      .toEqual(layout({ order: ["dietary", "email"], widths: { email: 300 } }));
  });

  it("clamps widths into range and drops anything that is not a number", () => {
    const raw = encodeURIComponent(JSON.stringify({ hidden: [], widths: { email: 5, dietary: 99999, room_no: "wide", source: null } }));
    expect(parseTablePrefs(raw, cols).widths).toEqual({ email: MIN_COLUMN_WIDTH, dietary: MAX_COLUMN_WIDTH });
  });

  // Order and widths were stored here before the shadcn revamp dropped them, and are back.
  // A cookie from then still carries them, and they were somebody's deliberate choice.
  it("honours order and widths left in a cookie from before the revamp", () => {
    const legacy = encodeURIComponent(JSON.stringify({ hidden: ["source"], order: ["dietary", "email"], widths: { email: 300 } }));
    expect(parseTablePrefs(legacy, cols)).toEqual(layout({ hidden: ["source"], order: ["dietary", "email"], widths: { email: 300 } }));
  });
});

describe("orderedColumns", () => {
  it("puts the placed columns first, then anything that arrived since in its own order", () => {
    // A column added after the reader arranged the table lands on the right rather than
    // vanishing because the stored order never mentioned it.
    expect(orderedColumns(cols, ["dietary", "email"]).map((c) => c.key))
      .toEqual(["dietary", "email", "category", "checked_in", "source", "shirt_size", "room_no"]);
  });

  it("ignores keys that are no longer columns", () => {
    expect(orderedColumns(cols, ["gone"]).map((c) => c.key)).toEqual(cols.map((c) => c.key));
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

describe("fields the event may or may not have", () => {
  it("has no built-in column for a field an event may not have", () => {
    expect(BUILTIN_COLUMNS.map((c) => c.key)).toEqual(["email", "category", "checked_in", "source"]);
  });

  it("takes company from the event's own fields, wherever it was defined", () => {
    const cols = allColumns([{ key: "company", label: "Company", type: "text" }], []);
    expect(cols.find((c) => c.key === "company")).toEqual({ key: "company", label: "Company", source: "registration" });
  });

  it("offers bulk edit the event's fields plus category", () => {
    expect(bulkFields([{ key: "table_no", label: "Table", type: "text" }]).map((f) => f.key))
      .toEqual(["category", "table_no"]);
  });

  it("still shows mobile and table by default even though they are fields now, not built-ins", () => {
    // A fresh browser on a new laptop at the registration desk must see them without anyone
    // first opening the Columns menu, the same as before migration 0014.
    const withLegacy = allColumns(
      [{ key: "phone", label: "Mobile", type: "phone" }],
      [{ key: "table_no", label: "Table", type: "text" }],
    );
    expect(defaultHidden(withLegacy)).not.toContain("phone");
    expect(defaultHidden(withLegacy)).not.toContain("table_no");
  });

  it("starts company hidden, like any other field the event happens to define", () => {
    // Company kept its default-visible slot long after migration 0014 made it an ordinary
    // field. It is ordinary in this respect too now: an event that wants it at the desk
    // ticks it in the Columns menu, the same as Shirt Size or Department.
    const cols = allColumns([{ key: "company", label: "Company", type: "text" }], []);
    expect(defaultHidden(cols)).toContain("company");
  });
});
