import { describe, it, expect } from "vitest";
import { reactivationPatch } from "@/lib/attendee-merge";

describe("reactivationPatch (D587)", () => {
  it("clears cancelled_at and merges answers without blanking stored ones", () => {
    const patch = reactivationPatch({ extra: { shirt: "M", diet: "Veg" } }, { name: "Ali", email: "ali@x.com", extra: { shirt: "L", diet: "" } });
    expect(patch.cancelled_at).toBeNull();
    expect(patch.extra).toEqual({ shirt: "L", diet: "Veg" });
  });
});
