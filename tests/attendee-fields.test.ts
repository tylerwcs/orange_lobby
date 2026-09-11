import { describe, expect, it } from "vitest";
import {
  addField, coerceFieldValue, fieldKey, fieldValuesFromForm, MAX_ATTENDEE_FIELDS,
  parseAttendeeFields, parseOptions, removeField, renameField, type AttendeeField,
} from "@/lib/attendee-fields";

const text = (label: string): AttendeeField => ({ key: fieldKey(label), label, type: "text" });

describe("parseAttendeeFields", () => {
  it("returns nothing for anything that is not an array", () => {
    expect(parseAttendeeFields(null)).toEqual([]);
    expect(parseAttendeeFields({ key: "a" })).toEqual([]);
    expect(parseAttendeeFields("[]")).toEqual([]);
  });

  it("keeps well-formed definitions and drops the rest", () => {
    const parsed = parseAttendeeFields([
      { key: "room_no", label: "Room no", type: "text" },
      { key: "", label: "No key", type: "text" },
      { key: "no_label", label: "   ", type: "text" },
      { key: "room_no", label: "Duplicate", type: "text" },
      null,
      { key: "arrives", label: "Arrives", type: "date" },
    ]);
    expect(parsed).toEqual([
      { key: "room_no", label: "Room no", type: "text" },
      { key: "arrives", label: "Arrives", type: "date" },
    ]);
  });

  it("falls back to text for an unknown type", () => {
    expect(parseAttendeeFields([{ key: "x", label: "X", type: "colour" }])).toEqual([{ key: "x", label: "X", type: "text" }]);
  });

  it("drops a choice column with no choices, and de-duplicates the ones it has", () => {
    expect(parseAttendeeFields([{ key: "d", label: "D", type: "select", options: [] }])).toEqual([]);
    expect(parseAttendeeFields([{ key: "d", label: "D", type: "select", options: ["Halal", " Halal ", "Veg", 3] }]))
      .toEqual([{ key: "d", label: "D", type: "select", options: ["Halal", "Veg"] }]);
  });

  it("stops at the maximum", () => {
    const many = Array.from({ length: MAX_ATTENDEE_FIELDS + 5 }, (_, i) => ({ key: `k${i}`, label: `K${i}`, type: "text" }));
    expect(parseAttendeeFields(many)).toHaveLength(MAX_ATTENDEE_FIELDS);
  });
});

describe("addField", () => {
  it("derives the storage key from the label", () => {
    const r = addField([], { label: "Room no", type: "text", options: "" });
    expect(r).toEqual({ ok: true, fields: [{ key: "room_no", label: "Room no", type: "text" }] });
  });

  it("refuses a blank or unusable name", () => {
    expect(addField([], { label: "  ", type: "text", options: "" })).toEqual({ ok: false, error: "Give the column a name" });
    expect(addField([], { label: "!!!", type: "text", options: "" })).toEqual({ ok: false, error: "Use letters or numbers in the column name" });
  });

  it("refuses a name the attendee row already owns", () => {
    const r = addField([], { label: "Email", type: "text", options: "" });
    expect(r.ok).toBe(false);
  });

  it("refuses a duplicate, including one that only differs in spacing or case", () => {
    const fields = [text("Room no")];
    expect(addField(fields, { label: "room  no", type: "text", options: "" }).ok).toBe(false);
  });

  it("refuses a choice column with no choices, and keeps them when there are", () => {
    expect(addField([], { label: "Dietary", type: "select", options: " , " }).ok).toBe(false);
    expect(addField([], { label: "Dietary", type: "select", options: "Halal, Vegetarian" })).toEqual({
      ok: true, fields: [{ key: "dietary", label: "Dietary", type: "select", options: ["Halal", "Vegetarian"] }],
    });
  });

  it("stops at the maximum", () => {
    const full = Array.from({ length: MAX_ATTENDEE_FIELDS }, (_, i) => text(`Col ${i}`));
    expect(addField(full, { label: "One more", type: "text", options: "" }).ok).toBe(false);
  });

  it("treats an unknown type as text", () => {
    const r = addField([], { label: "X", type: "colour", options: "" });
    expect(r.ok && r.fields[0].type).toBe("text");
  });
});

describe("renameField", () => {
  it("changes the label and leaves the key alone, so stored values keep their home", () => {
    const r = renameField([text("Room no")], "room_no", "Room number");
    expect(r).toEqual({ ok: true, fields: [{ key: "room_no", label: "Room number", type: "text" }] });
  });

  it("refuses a blank name or an unknown column", () => {
    expect(renameField([text("Room no")], "room_no", " ").ok).toBe(false);
    expect(renameField([text("Room no")], "gone", "Anything").ok).toBe(false);
  });
});

describe("removeField", () => {
  it("drops only the named definition", () => {
    expect(removeField([text("A"), text("B")], "a")).toEqual([text("B")]);
    expect(removeField([text("A")], "missing")).toEqual([text("A")]);
  });
});

describe("parseOptions", () => {
  it("trims, drops blanks and de-duplicates", () => {
    expect(parseOptions(" Halal , Veg ,, Halal ")).toEqual(["Halal", "Veg"]);
  });
});

describe("coerceFieldValue", () => {
  const select: AttendeeField = { key: "d", label: "D", type: "select", options: ["Halal", "Veg"] };

  it("keeps a choice only when it is one of the choices", () => {
    expect(coerceFieldValue(select, "Halal")).toBe("Halal");
    expect(coerceFieldValue(select, "Pescatarian")).toBe("");
  });

  it("keeps a number only when it is one", () => {
    const f: AttendeeField = { key: "n", label: "N", type: "number" };
    expect(coerceFieldValue(f, " 12.5 ")).toBe("12.5");
    expect(coerceFieldValue(f, "-3")).toBe("-3");
    expect(coerceFieldValue(f, "12kg")).toBe("");
  });

  it("keeps a date only in ISO form", () => {
    const f: AttendeeField = { key: "d", label: "D", type: "date" };
    expect(coerceFieldValue(f, "2026-09-30")).toBe("2026-09-30");
    expect(coerceFieldValue(f, "30/09/2026")).toBe("");
  });

  it("trims text and caps its length", () => {
    const f = text("Note");
    expect(coerceFieldValue(f, "  hello  ")).toBe("hello");
    expect(coerceFieldValue(f, "x".repeat(300))).toHaveLength(200);
    expect(coerceFieldValue(f, null)).toBe("");
  });
});

describe("fieldValuesFromForm", () => {
  const fields = [text("Room no"), { key: "dietary", label: "Dietary", type: "select", options: ["Halal"] } as AttendeeField];

  it("reads f_<key> inputs and normalises them", () => {
    const posted: Record<string, string> = { f_room_no: " 12A ", f_dietary: "Halal" };
    expect(fieldValuesFromForm(fields, (k) => posted[k] ?? null)).toEqual({ room_no: "12A", dietary: "Halal" });
  });

  it("clears a rendered field that was emptied", () => {
    const posted: Record<string, string> = { f_room_no: "", f_dietary: "Halal" };
    expect(fieldValuesFromForm(fields, (k) => posted[k] ?? null)).toEqual({ room_no: "", dietary: "Halal" });
  });

  it("skips a column the form never rendered, so saving a partial form cannot wipe it", () => {
    const posted: Record<string, string> = { f_room_no: "12A" };
    expect(fieldValuesFromForm(fields, (k) => posted[k] ?? null)).toEqual({ room_no: "12A" });
  });
});
