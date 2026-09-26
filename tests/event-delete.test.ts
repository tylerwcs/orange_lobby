import { describe, it, expect } from "vitest";
import { confirmsDelete, deleteBlockedBecause } from "@/lib/event-delete";

describe("deleteBlockedBecause", () => {
  it("refuses a live event", () => {
    expect(deleteBlockedBecause("live")).toMatch(/Draft or Archived/);
  });
  it("allows a draft or archived event", () => {
    expect(deleteBlockedBecause("draft")).toBeNull();
    expect(deleteBlockedBecause("archived")).toBeNull();
  });
});

describe("confirmsDelete", () => {
  it("needs the whole name, ignoring case and surrounding spaces", () => {
    expect(confirmsDelete("  ecp kom 2026 ", "ECP KOM 2026")).toBe(true);
    expect(confirmsDelete("ECP KOM", "ECP KOM 2026")).toBe(false);
    expect(confirmsDelete("", "ECP KOM 2026")).toBe(false);
  });
  it("never confirms an event with no name", () => {
    expect(confirmsDelete("", "  ")).toBe(false);
  });
});
