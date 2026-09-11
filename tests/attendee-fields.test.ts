import { describe, expect, it } from "vitest";
import {
  addField, adoptValue, coerceFieldValue, fieldKey, fieldValuesFromForm, keyMatchesField,
  labelFromKey, MAX_ATTENDEE_FIELDS, parseAttendeeFields, parseOptions, removeField,
  renameField, unclaimedKeys, fieldsFromQuestions, eventFields, type AttendeeField,
} from "@/lib/attendee-fields";
import type { RegistrationQuestion } from "@/lib/types";

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

describe("keyMatchesField", () => {
  const field: AttendeeField = { key: "shirt_size", label: "Shirt size", type: "text" };

  it("matches the column's own key, its label's spelling, and the same words slugged", () => {
    expect(keyMatchesField("shirt_size", field)).toBe(true);   // registration answer
    expect(keyMatchesField("Shirt Size", field)).toBe(true);   // imported header
    expect(keyMatchesField("shirt size", field)).toBe(true);
    expect(keyMatchesField("Shirt-Size", field)).toBe(true);
  });

  it("does not match a different fact", () => {
    expect(keyMatchesField("jacket_size", field)).toBe(false);
    expect(keyMatchesField("shirt", field)).toBe(false);
  });
});

describe("adoptValue", () => {
  const field: AttendeeField = { key: "shirt_size", label: "Shirt size", type: "text" };

  it("moves a value stored under another spelling onto the column's key", () => {
    expect(adoptValue({ "Shirt Size": "M", Seat: "3" }, field)).toEqual({ shirt_size: "M", Seat: "3" });
  });

  it("leaves a value already in the right place alone", () => {
    expect(adoptValue({ shirt_size: "M" }, field)).toBeNull();
    expect(adoptValue({ Seat: "3" }, field)).toBeNull();
    expect(adoptValue({}, field)).toBeNull();
  });

  it("keeps the value already under the column's key, but still drops the stray copy", () => {
    // Otherwise the attendance export carries the same column twice, under two spellings.
    expect(adoptValue({ shirt_size: "L", "Shirt Size": "M" }, field)).toEqual({ shirt_size: "L" });
  });

  it("fills a blank column from the stray copy rather than keeping the blank", () => {
    expect(adoptValue({ shirt_size: "", "Shirt Size": "M" }, field)).toEqual({ shirt_size: "M" });
  });
});

describe("unclaimedKeys", () => {
  const extras: Record<string, string>[] = [
    { shirt_size: "M", "Room partner": "Ali", seed: "1" },
    { shirt_size: "L", seed: "1" },
    { shirt_size: "", nickname: "Wei" },
  ];

  it("counts only attendees who actually have a value", () => {
    expect(unclaimedKeys(extras, [])).toEqual([
      { key: "seed", count: 2 },
      { key: "shirt_size", count: 2 },
      { key: "nickname", count: 1 },
      { key: "Room partner", count: 1 },
    ]);
  });

  it("drops anything an existing column already claims, under any spelling", () => {
    const fields: AttendeeField[] = [{ key: "shirt_size", label: "Shirt size", type: "text" }, { key: "room_partner", label: "Room partner", type: "text" }];
    expect(unclaimedKeys(extras, fields).map((s) => s.key)).toEqual(["seed", "nickname"]);
  });

  it("caps the list", () => {
    const many = [Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, "x"]))];
    expect(unclaimedKeys(many, [], 5)).toHaveLength(5);
  });
});

describe("labelFromKey", () => {
  it("turns a stored key back into something worth showing", () => {
    expect(labelFromKey("shirt_size")).toBe("Shirt size");
    expect(labelFromKey("room-partner")).toBe("Room partner");
    expect(labelFromKey("Dietary")).toBe("Dietary");
  });
});

describe("fieldsFromQuestions", () => {
  it("turns a registration question into a column of the same key and label", () => {
    expect(fieldsFromQuestions([
      { key: "shirt_size", label: "Shirt size", type: "text", required: true },
      { key: "dietary", label: "Dietary", type: "select", required: false, options: ["Halal", " Veg ", ""] },
    ])).toEqual([
      { key: "shirt_size", label: "Shirt size", type: "text" },
      { key: "dietary", label: "Dietary", type: "select", options: ["Halal", "Veg"] },
    ]);
  });

  it("falls back to free text for a choice that lost its choices, so the answer stays editable", () => {
    expect(fieldsFromQuestions([{ key: "d", label: "D", type: "select", required: false, options: [] }]))
      .toEqual([{ key: "d", label: "D", type: "text" }]);
  });
});

describe("eventFields", () => {
  const questions: RegistrationQuestion[] = [{ key: "shirt_size", label: "Shirt size", type: "text", required: true }];

  it("reads the form's questions first, then the columns added on top", () => {
    const custom: AttendeeField[] = [{ key: "room_no", label: "Room no", type: "text" }];
    expect(eventFields(questions, custom).map((f) => f.key)).toEqual(["shirt_size", "room_no"]);
  });

  it("does not list a column twice when a custom one shares a question's key", () => {
    const custom: AttendeeField[] = [{ key: "shirt_size", label: "Shirt size", type: "text" }];
    expect(eventFields(questions, custom)).toHaveLength(1);
  });
});

describe("addField against the registration form", () => {
  it("refuses a column the form already asks for", () => {
    const r = addField([], { label: "Shirt size", type: "text", options: "" }, ["shirt_size"]);
    expect(r).toEqual({ ok: false, error: "“Shirt size” is already a question on the registration form" });
  });

  it("allows a column the form never asks for", () => {
    expect(addField([], { label: "Room number", type: "text", options: "" }, ["shirt_size"]).ok).toBe(true);
  });
});
