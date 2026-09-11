import { describe, expect, it } from "vitest";
import { allColumns, bulkFields, BULK_BUILTIN_FIELDS, BUILTIN_COLUMNS, columnsCookieName, hiddenFromCookie, hiddenToCookie, visibleColumns } from "@/lib/columns";
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
