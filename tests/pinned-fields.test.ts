import { describe, it, expect } from "vitest";
import { parsePinnedFields, resolvePins, pinnableFields, addPin, removePin, reorderPins, pinScale, hydratePins, MAX_PINS } from "@/lib/pinned-fields";
import type { Attendee } from "@/lib/types";

const attendee = (over: Partial<Attendee> = {}): Attendee => ({
  id: "a1", org_id: "o", event_id: "e", token: "t", name: "Tan Ah Kow",
  email: "t@x.test", phone: null, company: "Ecopia", category: "VIP", table_no: "12",
  extra: { room_no: "1204", room_partner: "Ahmad Bin Hassan", dietary: "", shirt_size: "XL" },
  source: "import", status: "active", ...over,
});

const fields = [
  { key: "room_no", label: "Room number", type: "text" as const },
  { key: "room_partner", label: "Hotel room partner", type: "text" as const },
  { key: "dietary", label: "Dietary", type: "text" as const },
];

describe("parsePinnedFields", () => {
  it("reads the stored list in order", () => {
    expect(parsePinnedFields([{ key: "room_no" }, { key: "table_no", label: "Table" }]))
      .toEqual([{ key: "room_no" }, { key: "table_no", label: "Table" }]);
  });

  it("drops malformed entries rather than throwing", () => {
    // Same rule as attendee_fields: a bad definition must not take the portal down on
    // event day, it must simply not render.
    expect(parsePinnedFields([{ key: "room_no" }, null, { label: "no key" }, "nope", { key: "" }]))
      .toEqual([{ key: "room_no" }]);
  });

  it("drops a repeated key so one field cannot occupy two slots", () => {
    expect(parsePinnedFields([{ key: "room_no" }, { key: "room_no", label: "Again" }])).toHaveLength(1);
  });

  it("caps the list", () => {
    const many = Array.from({ length: MAX_PINS + 3 }, (_, i) => ({ key: `k${i}` }));
    expect(parsePinnedFields(many)).toHaveLength(MAX_PINS);
  });

  it("returns nothing for a column that was never set", () => {
    expect(parsePinnedFields(null)).toEqual([]);
  });
});

describe("resolvePins", () => {
  it("reads a native column and an extra key alike", () => {
    const out = resolvePins([{ key: "table_no" }, { key: "room_no" }], attendee(), fields);
    expect(out).toEqual([{ key: "table_no", label: "Table", value: "12" }, { key: "room_no", label: "Room number", value: "1204" }]);
  });

  it("drops a pin this attendee has no value for", () => {
    // A pin is per event; a value is per person. An empty row on the badge is worse than
    // no row at all.
    expect(resolvePins([{ key: "dietary" }, { key: "room_no" }], attendee(), fields).map((p) => p.key)).toEqual(["room_no"]);
  });

  it("prefers the pin's own short label over the field's", () => {
    expect(resolvePins([{ key: "room_partner", label: "Partner" }], attendee(), fields)[0].label).toBe("Partner");
  });

  it("drops a pin whose field no longer exists, even though the value is still there", () => {
    // Deleting an attendee column leaves its values in `extra` and its pin behind. The
    // pin must stop rendering rather than caption the badge with a raw storage key.
    expect(attendee().extra.shirt_size).toBe("XL");
    expect(resolvePins([{ key: "shirt_size" }], attendee(), fields)).toEqual([]);
  });
});

describe("pinnableFields", () => {
  it("offers native columns and the event's own fields together", () => {
    const keys = pinnableFields([{ key: "shirt_size", label: "Shirt size", type: "text", required: false }], [{ key: "room_no", label: "Room number", type: "text" }]).map((f) => f.key);
    expect(keys).toContain("table_no");
    expect(keys).toContain("shirt_size");
    expect(keys).toContain("room_no");
  });

  it("does not offer the attendee's name, which is the heading above the pins", () => {
    expect(pinnableFields([], []).map((f) => f.key)).not.toContain("name");
  });
});

describe("addPin", () => {
  it("appends the chosen field", () => {
    const r = addPin([{ key: "table_no" }], "room_no", "");
    expect(r.ok && r.pins).toEqual([{ key: "table_no" }, { key: "room_no" }]);
  });

  it("keeps a short label when one is given", () => {
    const r = addPin([], "room_partner", "Partner");
    expect(r.ok && r.pins[0]).toEqual({ key: "room_partner", label: "Partner" });
  });

  it("refuses a field that is already pinned", () => {
    const r = addPin([{ key: "room_no" }], "room_no", "");
    expect(r).toMatchObject({ ok: false });
  });

  it("refuses to go past the cap", () => {
    const full = Array.from({ length: MAX_PINS }, (_, i) => ({ key: `k${i}` }));
    expect(addPin(full, "one_more", "")).toMatchObject({ ok: false });
  });
});

describe("removePin", () => {
  it("drops the named pin and keeps the order of the rest", () => {
    expect(removePin([{ key: "a" }, { key: "b" }, { key: "c" }], "b").map((p) => p.key)).toEqual(["a", "c"]);
  });
});

describe("reorderPins", () => {
  it("rearranges to the given order, keeping anything the list forgot", () => {
    expect(reorderPins([{ key: "a" }, { key: "b" }, { key: "c" }], ["c", "a"]).map((p) => p.key)).toEqual(["c", "a", "b"]);
  });
});

describe("pinScale", () => {
  it("gives a short value the big treatment", () => {
    expect(pinScale("1204")).toBe("large");
  });

  it("drops a long value to the small treatment rather than wrapping it", () => {
    // "Ahmad Bin Hassan" at the table number's size is three lines and a broken card.
    expect(pinScale("Ahmad Bin Hassan")).toBe("small");
  });
});

describe("hydratePins", () => {
  it("shows the table number when the column does not exist yet", () => {
    // The window between this code deploying and migration 0006 running. Without this the
    // badge would silently lose the table number it has always shown.
    expect(hydratePins({} as { pinned_fields?: unknown })).toEqual([{ key: "table_no" }]);
  });

  it("respects an empty list, which means the admin unpinned everything", () => {
    // Deliberately different from the case above: [] is a decision, a missing column is
    // an un-migrated database.
    expect(hydratePins({ pinned_fields: [] })).toEqual([]);
  });

  it("reads a stored list", () => {
    expect(hydratePins({ pinned_fields: [{ key: "room_no" }] })).toEqual([{ key: "room_no" }]);
  });
});

describe("pinnableFields and what the event collects", () => {
  it("does not offer a field the event has switched off", () => {
    const keys = pinnableFields([], [], ["company"]).map((f) => f.key);
    expect(keys).toContain("company");
    expect(keys).not.toContain("table_no");
    expect(keys).not.toContain("phone");
  });

  it("still offers the fields that carry behaviour", () => {
    const keys = pinnableFields([], [], []).map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(["email", "category"]));
  });
});

describe("resolvePins and what the event collects", () => {
  it("drops a pin for a field the event has switched off", () => {
    // Settings promises that switching a field off hides it everywhere. The badge is the
    // most visible "everywhere" there is — an attendee's own phone.
    const pins = [{ key: "table_no" }, { key: "room_no" }];
    const out = resolvePins(pins, attendee(), fields, ["company"]);
    expect(out.map((p) => p.key)).toEqual(["room_no"]);
  });

  it("keeps the pin itself, so turning the field back on restores the badge", () => {
    // Only the rendering is suppressed; nothing rewrites events.pinned_fields.
    const pins = [{ key: "table_no" }];
    expect(resolvePins(pins, attendee(), fields, [])).toEqual([]);
    expect(resolvePins(pins, attendee(), fields, ["table_no"])).toHaveLength(1);
  });

  it("never drops a field that carries behaviour", () => {
    expect(resolvePins([{ key: "category" }], attendee(), fields, []).map((p) => p.key)).toEqual(["category"]);
  });
});
