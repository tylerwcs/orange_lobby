import { describe, it, expect } from "vitest";
import { reactivationPatch } from "@/lib/attendee-merge";

describe("reactivationPatch (D587)", () => {
  it("clears cancelled_at and merges answers without blanking stored ones", () => {
    const patch = reactivationPatch({ extra: { shirt: "M", diet: "Veg" } }, { name: "Ali", email: "ali@x.com", extra: { shirt: "L", diet: "" } });
    expect(patch.cancelled_at).toBeNull();
    expect(patch.extra).toEqual({ shirt: "L", diet: "Veg" });
  });

  it("drops a cancelled row's reason, keeps an active row's (D614)", () => {
    const input = { name: "Ali", email: "ali@x.com", extra: {} };
    expect(reactivationPatch({ extra: {}, cancelled_at: "2026-10-14T00:00:00Z" }, input)).toHaveProperty("cancel_reason", null);
    expect(reactivationPatch({ extra: {}, cancelled_at: null }, input)).not.toHaveProperty("cancel_reason");
  });
});
