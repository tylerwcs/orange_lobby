import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attendeeLink, attendeePath, genericLink, registrationLink, boothScannerLink, crewLink, hostLink, displayLink } from "@/lib/links";

describe("attendee links (D426)", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://events.ecopiaevents.com/"));
  afterEach(() => vi.unstubAllEnvs());
  const plain = { slug: "kom-2026", domain: null };
  const own = { slug: "kom-2026", domain: "kom.example.com" };

  it("builds links on the app's address when the event has none", () => {
    expect(genericLink(plain)).toBe("https://events.ecopiaevents.com/e/kom-2026");
    expect(attendeeLink(plain, "abcdefghjkmn")).toBe("https://events.ecopiaevents.com/e/kom-2026/a/abcdefghjkmn");
    expect(registrationLink(plain)).toBe("https://events.ecopiaevents.com/e/kom-2026/register");
  });

  it("builds short links on the event's own address", () => {
    expect(genericLink(own)).toBe("https://kom.example.com");
    expect(attendeeLink(own, "abcdefghjkmn")).toBe("https://kom.example.com/a/abcdefghjkmn");
    expect(registrationLink(own)).toBe("https://kom.example.com/register");
  });

  it("keeps the app's protocol and port, so *.localhost works in development", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    expect(attendeeLink({ slug: "kom", domain: "kom.localhost" }, "abcdefghjkmn")).toBe("http://kom.localhost:3000/a/abcdefghjkmn");
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

  it("is what attendeeLink appends to the app's address, so the two cannot drift", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://events.example.com");
    try {
      expect(attendeeLink({ slug: "kom-2026", domain: null }, "abcdefghjkmn"))
        .toBe("https://events.example.com" + attendeePath("kom-2026", "abcdefghjkmn"));
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("game links (D252)", () => {
  it("puts the host console outside the portal, by token alone", () => {
    expect(hostLink("https://ecphub.vercel.app/", "abcdefghjkmn")).toBe("https://ecphub.vercel.app/host/abcdefghjkmn");
  });
  it("puts the LED display outside the portal, by token alone", () => {
    expect(displayLink("https://ecphub.vercel.app", "abcdefghjkmn")).toBe("https://ecphub.vercel.app/display/abcdefghjkmn");
  });
});
