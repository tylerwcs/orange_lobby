import { describe, it, expect } from "vitest";
import { parseQuestions, validateRegistration } from "@/lib/registration";

const qs = parseQuestions(JSON.stringify([
  { key: "tshirt", label: "T-shirt", type: "select", required: true, options: ["S", "M"] },
  { key: "remarks", label: "Remarks", type: "text", required: false },
]));

describe("parseQuestions", () => {
  it("accepts an optional description", () => {
    const qs = parseQuestions(JSON.stringify([{ key: "stay", label: "Stay?", type: "select", required: true, options: ["No", "Yes"], description: "50% covered by Ecopia" }]));
    expect(qs[0].description).toBe("50% covered by Ecopia");
    expect(parseQuestions(JSON.stringify([{ key: "n", label: "N", type: "text" }]))[0].description).toBeUndefined();
  });
  it("rejects bad shapes with a message", () => {
    expect(() => parseQuestions("{")).toThrow(/JSON/);
    expect(() => parseQuestions(JSON.stringify([{ key: "x" }]))).toThrow(/label/);
    expect(() => parseQuestions(JSON.stringify([{ key: "x", label: "X", type: "select", required: true }]))).toThrow(/options/);
  });
});

describe("validateRegistration", () => {
  it("requires name and a valid email", () => {
    const r = validateRegistration({ name: "", email: "nope", tshirt: "S" }, qs);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.errors.name).toBeTruthy(); expect(r.errors.email).toBeTruthy(); }
  });
  it("enforces required select and allowed options", () => {
    const r = validateRegistration({ name: "A", email: "a@b.co", tshirt: "XXL" }, qs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.tshirt).toBeTruthy();
  });
  it("returns trimmed data with extra answers", () => {
    const r = validateRegistration({ name: " Ann ", email: " Ann@B.co ", phone: "012", company: "Ecopia", tshirt: "M", remarks: "" }, qs);
    expect(r.ok).toBe(true);
    // phone/company aren't questions this event asked (qs only has tshirt/remarks), so they're dropped like any other unasked field.
    if (r.ok) expect(r.data).toEqual({ name: "Ann", email: "ann@b.co", extra: { tshirt: "M", remarks: "" } });
  });
});

describe("phone and number questions", () => {
  it("accepts a phone question", () => {
    expect(parseQuestions([{ key: "phone", label: "Mobile", type: "phone", required: false }]))
      .toHaveLength(1);
  });

  it("accepts a number question", () => {
    expect(parseQuestions([{ key: "guests", label: "Guests", type: "number", required: false }]))
      .toHaveLength(1);
  });

  it("still rejects a type it does not know", () => {
    expect(() => parseQuestions([{ key: "x", label: "X", type: "file", required: false }])).toThrow();
  });
});

describe("validateRegistration after unification", () => {
  const q = (key: string, type: "text" | "phone" = "text") =>
    ({ key, label: key, type, required: false }) as const;

  it("puts every answer in extra, including phone and company", () => {
    const r = validateRegistration(
      { name: "Sam", email: "S@x.com", phone: "012", company: "Ecopia" },
      [q("phone", "phone"), q("company")],
    );
    expect(r).toEqual({ ok: true, data: { name: "Sam", email: "s@x.com", extra: { phone: "012", company: "Ecopia" } } });
  });

  it("ignores a phone the event never asked for", () => {
    const r = validateRegistration({ name: "Sam", email: "s@x.com", phone: "012" }, []);
    expect(r).toEqual({ ok: true, data: { name: "Sam", email: "s@x.com", extra: {} } });
  });

  it("still requires name and a valid email", () => {
    expect(validateRegistration({ name: "", email: "nope" }, [])).toMatchObject({ ok: false });
  });
});

describe("show_when", () => {
  const qs2 = parseQuestions(JSON.stringify([
    { key: "stay", label: "Stay?", type: "select", required: true, options: ["No", "Yes – Twin"] },
    { key: "partner", label: "Partner", type: "text", required: true, show_when: { key: "stay", includes: "Twin" } },
  ]));
  it("parses show_when and only requires the dependent answer when the parent matches", () => {
    expect(qs2[1].show_when).toEqual({ key: "stay", includes: "Twin" });
    const hidden = validateRegistration({ name: "A", email: "a@b.co", stay: "No" }, qs2);
    expect(hidden.ok).toBe(true);
    if (hidden.ok) expect(hidden.data.extra.partner).toBe("");
    const shown = validateRegistration({ name: "A", email: "a@b.co", stay: "Yes – Twin" }, qs2);
    expect(shown.ok).toBe(false);
    if (!shown.ok) expect(shown.errors.partner).toMatch(/required/);
  });
});
