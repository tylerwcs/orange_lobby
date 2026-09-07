import { describe, it, expect } from "vitest";
import { attendeeLink, genericLink, registrationLink } from "@/lib/links";

describe("links", () => {
  const base = "https://events.ecopiaevents.com/";
  it("builds links without double slashes", () => {
    expect(genericLink(base, "kom-2026")).toBe("https://events.ecopiaevents.com/e/kom-2026");
    expect(attendeeLink(base, "kom-2026", "abcdefghjkmn")).toBe("https://events.ecopiaevents.com/e/kom-2026/a/abcdefghjkmn");
    expect(registrationLink(base, "kom-2026")).toBe("https://events.ecopiaevents.com/e/kom-2026/register");
  });
});
