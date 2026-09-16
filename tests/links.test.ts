import { describe, it, expect } from "vitest";
import { attendeeLink, genericLink, registrationLink, boothScannerLink } from "@/lib/links";

describe("links", () => {
  const base = "https://events.ecopiaevents.com/";
  it("builds links without double slashes", () => {
    expect(genericLink(base, "kom-2026")).toBe("https://events.ecopiaevents.com/e/kom-2026");
    expect(attendeeLink(base, "kom-2026", "abcdefghjkmn")).toBe("https://events.ecopiaevents.com/e/kom-2026/a/abcdefghjkmn");
    expect(registrationLink(base, "kom-2026")).toBe("https://events.ecopiaevents.com/e/kom-2026/register");
  });
});

describe("boothScannerLink", () => {
  it("points at the staff route, outside the attendee portal", () => {
    expect(boothScannerLink("https://events.example.com", "k7m2xq9rt4bd"))
      .toBe("https://events.example.com/booth/k7m2xq9rt4bd");
  });

  it("tolerates a trailing slash on the base", () => {
    expect(boothScannerLink("https://events.example.com/", "k7m2xq9rt4bd"))
      .toBe("https://events.example.com/booth/k7m2xq9rt4bd");
  });
});
