import { describe, it, expect } from "vitest";
import { parseQuestions, validateRegistration } from "@/lib/registration";

const qs = parseQuestions(JSON.stringify([
  { key: "tshirt", label: "T-shirt", type: "select", required: true, options: ["S", "M"] },
  { key: "remarks", label: "Remarks", type: "text", required: false },
]));

describe("parseQuestions", () => {
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
    if (r.ok) expect(r.data).toEqual({ name: "Ann", email: "ann@b.co", phone: "012", company: "Ecopia", extra: { tshirt: "M", remarks: "" } });
  });
});
