import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it("allows a normal absolute path", () => {
    expect(safeNextPath("/admin/events")).toBe("/admin/events");
  });
  it("rejects protocol-relative URLs (//evil.com)", () => {
    expect(safeNextPath("//evil.com")).toBe("/admin");
  });
  it("rejects backslash-prefixed paths (/\\evil.com)", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/admin");
  });
  it("rejects absolute URLs with a scheme", () => {
    expect(safeNextPath("https://evil.com")).toBe("/admin");
  });
  it("rejects an empty string", () => {
    expect(safeNextPath("")).toBe("/admin");
  });
});
