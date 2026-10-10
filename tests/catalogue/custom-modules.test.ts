import { describe, expect, it } from "vitest";
import { readCustomModule } from "@/features/catalogue/client";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("readCustomModule (D436)", () => {
  it("reads a name and a description, trimmed", () => {
    expect(readCustomModule(form({ name: "  Photo mosaic wall ", description: " Live wall of guest photos " })))
      .toEqual({ ok: true, value: { name: "Photo mosaic wall", description: "Live wall of guest photos" } });
  });
  it("stores an empty description as null", () => {
    expect(readCustomModule(form({ name: "Mosaic", description: "   " }))).toEqual({ ok: true, value: { name: "Mosaic", description: null } });
  });
  it("refuses a missing name", () => {
    expect(readCustomModule(form({ name: "  " }))).toEqual({ ok: false, error: "Give the custom module a name." });
  });
  it("refuses a name over 80 characters", () => {
    expect(readCustomModule(form({ name: "x".repeat(81) }))).toEqual({ ok: false, error: "Keep the name to 80 characters." });
  });
  it("refuses a description over 2,000 characters", () => {
    expect(readCustomModule(form({ name: "Mosaic", description: "x".repeat(2001) }))).toEqual({ ok: false, error: "Keep the description to 2,000 characters." });
  });
});
