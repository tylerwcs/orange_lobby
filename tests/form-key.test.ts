import { describe, it, expect } from "vitest";
import { formKey } from "@/lib/form-key";

describe("formKey", () => {
  it("is the same for the same saved values", () => {
    expect(formKey({ name: "KOM", venue: "Marriott" })).toBe(formKey({ name: "KOM", venue: "Marriott" }));
  });
  it("changes when any saved value does", () => {
    expect(formKey({ name: "KOM", venue: "Marriott" })).not.toBe(formKey({ name: "KOM", venue: "Hilton" }));
    expect(formKey(["a", null])).not.toBe(formKey(["a", ""]));
  });
});
