import { describe, it, expect } from "vitest";
import { extractToken, scanResultFields, scanFieldsFromForm, MAX_SCAN_FIELDS } from "@/lib/scan";
import type { Attendee, Event } from "@/lib/types";

describe("extractToken", () => {
  it("reads token from URL or bare string", () => {
    expect(extractToken("https://events.ecopiaevents.com/e/kom/a/abcdefghjkmn")).toBe("abcdefghjkmn");
    expect(extractToken("abcdefghjkmn")).toBe("abcdefghjkmn");
    expect(extractToken("https://x/e/kom")).toBeNull();
    expect(extractToken("hello world")).toBeNull();
  });
});

describe("scanResultFields", () => {
  it("shows category, then the fields the event chose, resolved by key", () => {
    const a = { category: "VIP", extra: { company: "Ecopia" } } as never;
    const e = {
      scan_extra_fields: ["company"],
      attendee_fields: [{ key: "company", label: "Company", type: "text" as const }],
      registration_questions: [],
    };
    expect(scanResultFields(a, e)).toEqual([
      { label: "Category", value: "VIP" },
      { label: "Company", value: "Ecopia" },
    ]);
  });

  it("still resolves a field configured by its label, as the old free-text box stored it", () => {
    const a = { category: "", extra: { shirt_size: "L" } } as never;
    const e = {
      scan_extra_fields: ["Shirt size"],
      attendee_fields: [{ key: "shirt_size", label: "Shirt size", type: "text" as const }],
      registration_questions: [],
    };
    expect(scanResultFields(a, e)).toEqual([
      { label: "Category", value: "" },
      { label: "Shirt size", value: "L" },
    ]);
  });

  it("finds a defined column named by its label, whose storage key is the slug", () => {
    const a = { name: "Ann", company: null, category: null, table_no: null, extra: { room_no: "12A" } } as unknown as Attendee;
    const e = { scan_extra_fields: ["Room no"], attendee_fields: [{ key: "room_no", label: "Room no", type: "text" }] } as Event;
    expect(scanResultFields(a, e).at(-1)).toEqual({ label: "Room no", value: "12A" });
  });

  it("leaves a configured name that matches nothing as a blank row rather than dropping it", () => {
    const a = { name: "Ann", company: null, category: null, table_no: null, extra: {} } as unknown as Attendee;
    const e = { scan_extra_fields: ["Nothing"], attendee_fields: [] } as unknown as Event;
    expect(scanResultFields(a, e).at(-1)).toEqual({ label: "Nothing", value: "" });
  });
});

describe("scanFieldsFromForm", () => {
  const fields = [
    { key: "company", label: "Company", type: "text" as const },
    { key: "table_no", label: "Table", type: "text" as const },
    { key: "shirt_size", label: "Shirt size", type: "text" as const },
  ];

  it("keeps the fields the event has, in the order they were picked", () => {
    expect(scanFieldsFromForm(["table_no", "company"], fields)).toEqual(["table_no", "company"]);
  });

  it("keeps a value that matches no field — scanResultFields may still resolve it as a raw extra key", () => {
    expect(scanFieldsFromForm(["company", "ghost"], fields)).toEqual(["company", "ghost"]);
  });

  it("drops a repeat rather than showing the same line twice", () => {
    expect(scanFieldsFromForm(["company", "company"], fields)).toEqual(["company"]);
  });

  it("pins the cap at 4", () => {
    expect(MAX_SCAN_FIELDS).toBe(4);
  });

  it("keeps only the first MAX_SCAN_FIELDS, in posted order", () => {
    const many = ["company", "table_no", "shirt_size", "a", "b"];
    const withAll = [...fields, { key: "a", label: "A", type: "text" as const }, { key: "b", label: "B", type: "text" as const }];
    expect(scanFieldsFromForm(many, withAll)).toEqual(["company", "table_no", "shirt_size", "a"]);
  });

  it("empties the card when nothing is posted", () => {
    expect(scanFieldsFromForm([], fields)).toEqual([]);
  });

  it("drops whitespace-only entries", () => {
    expect(scanFieldsFromForm(["   ", "\t", ""], fields)).toEqual([]);
  });

  it("keeps a stored value that matches a field by label, as the old free-text box wrote them — normalised to the field's key", () => {
    // scanResultFields resolves by key or label, so a setting written before the picker
    // existed must survive a save made through it. It comes back out as the key: a label
    // is not a stable identity (renaming the field changes it), the key is.
    expect(scanFieldsFromForm(["Shirt size"], fields)).toEqual(["shirt_size"]);
  });

  it("collapses both spellings of the same field into one entry", () => {
    // The old free-text box stored labels; the picker stores keys. A save made partway
    // through migrating must not print the same field twice on the card.
    expect(scanFieldsFromForm(["Shirt size", "shirt_size"], fields)).toEqual(["shirt_size"]);
  });
});

import { describeCameraError } from "@/lib/scan";

describe("describeCameraError", () => {
  it("explains permission denial with a recovery step", () => {
    const d = describeCameraError(new DOMException("Permission denied", "NotAllowedError"));
    expect(d.title).toBe("Camera blocked");
    expect(d.hint).toMatch(/Allow camera/);
  });
  it("handles missing and busy cameras and unknown errors", () => {
    expect(describeCameraError({ name: "NotFoundError" }).title).toBe("No camera found");
    expect(describeCameraError({ name: "NotReadableError" }).title).toBe("Camera is in use");
    expect(describeCameraError("Error getting userMedia, error = NotAllowedError: Permission denied").title).toBe("Camera blocked");
    expect(describeCameraError(new Error("boom")).title).toBe("Camera unavailable");
  });
});
