import { describe, it, expect } from "vitest";
import { attendeeLink, attendeePath, genericLink, registrationLink, boothScannerLink, crewLink } from "@/lib/links";

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

describe("crewLink", () => {
  it("points at the staff route, outside the attendee portal", () => {
    expect(crewLink("https://events.example.com", "k7m2xq9rt4bd"))
      .toBe("https://events.example.com/crew/k7m2xq9rt4bd");
  });

  it("tolerates a trailing slash on the base", () => {
    expect(crewLink("https://events.example.com/", "k7m2xq9rt4bd"))
      .toBe("https://events.example.com/crew/k7m2xq9rt4bd");
  });
});

describe("attendeePath", () => {
  it("is the personal portal path, with no host on the front", () => {
    expect(attendeePath("kom-2026", "abcdefghjkmn")).toBe("/e/kom-2026/a/abcdefghjkmn");
  });

  it("is what attendeeLink appends to its base, so the two cannot drift", () => {
    expect(attendeeLink("https://events.example.com", "kom-2026", "abcdefghjkmn"))
      .toBe("https://events.example.com" + attendeePath("kom-2026", "abcdefghjkmn"));
  });
});
