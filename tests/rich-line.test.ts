import { describe, it, expect } from "vitest";
import { richParts } from "@/features/language/rich";

describe("richParts (D739)", () => {
  it("splits text, bold and icons in order", () => {
    expect(richParts("Tap **Share** {share}.")).toEqual([
      { kind: "text", value: "Tap " },
      { kind: "bold", value: "Share" },
      { kind: "text", value: " " },
      { kind: "icon", value: "share" },
      { kind: "text", value: "." },
    ]);
  });
  it("leaves plain text alone", () => {
    expect(richParts("No marks here")).toEqual([{ kind: "text", value: "No marks here" }]);
  });
});
