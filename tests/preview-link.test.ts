import { describe, it, expect } from "vitest";
import { previewCookieMatches, previewLanding, previewLink } from "@/lib/preview-link";

describe("previewCookieMatches (D715)", () => {
  it("opens the preview only for the event's current link", () => {
    expect(previewCookieMatches("abcdefghjkmn", "abcdefghjkmn")).toBe(true);
    expect(previewCookieMatches("abcdefghjkmn", "abcdefghjkmp")).toBe(false);
  });

  it("refuses when the link is off or there is no cookie", () => {
    expect(previewCookieMatches(null, "abcdefghjkmn")).toBe(false);
    expect(previewCookieMatches(undefined, "abcdefghjkmn")).toBe(false);
    expect(previewCookieMatches("abcdefghjkmn", undefined)).toBe(false);
    expect(previewCookieMatches(null, undefined)).toBe(false);
  });

  it("refuses a value that is not a token shape, even if the column held one", () => {
    expect(previewCookieMatches("ABC", "ABC")).toBe(false);
  });
});

describe("previewLanding (D716)", () => {
  const ev = { id: "ev1", slug: "uobih2" };
  const a = { event_id: "ev1", token: "abcdefghjkmn", cancelled_at: null };

  it("opens the chosen attendee's own page", () => {
    expect(previewLanding(ev, a)).toBe("/e/uobih2/a/abcdefghjkmn");
  });

  it("falls back to the general portal with no one chosen, a cancellation, or another event's attendee", () => {
    expect(previewLanding(ev, null)).toBe("/e/uobih2");
    expect(previewLanding(ev, { ...a, cancelled_at: "2026-10-20T00:00:00Z" })).toBe("/e/uobih2");
    expect(previewLanding(ev, { ...a, event_id: "ev2" })).toBe("/e/uobih2");
  });
});

describe("previewLink (D715)", () => {
  it("is the event's preview path on the given host", () => {
    expect(previewLink("https://ecphub.vercel.app/", "uobih2", "abcdefghjkmn")).toBe("https://ecphub.vercel.app/e/uobih2/preview/abcdefghjkmn");
  });
});
