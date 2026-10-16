import { describe, it, expect } from "vitest";
import { comingSoonMessage, DEFAULT_COMING_SOON } from "@/lib/coming-soon";

describe("comingSoonMessage (D617)", () => {
  it("falls back to the default when unset or blank", () => {
    expect(comingSoonMessage({})).toBe(DEFAULT_COMING_SOON);
    expect(comingSoonMessage({ coming_soon_message: null })).toBe(DEFAULT_COMING_SOON);
    expect(comingSoonMessage({ coming_soon_message: "  \n " })).toBe(DEFAULT_COMING_SOON);
  });
  it("uses the organiser's words, trimmed, line breaks kept", () => {
    expect(comingSoonMessage({ coming_soon_message: " Doors open 30 Sep.\nSee you there! " })).toBe("Doors open 30 Sep.\nSee you there!");
  });
});
