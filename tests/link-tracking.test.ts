import { describe, expect, it } from "vitest";
import { cleanSource, countsAsRegistration, trackedLink } from "@/features/link-tracking/client";

describe("cleanSource (D899)", () => {
  it("keeps a tidy tag as it is", () => {
    expect(cleanSource("obesity-site-popup")).toBe("obesity-site-popup");
  });
  it("lower-cases and turns spaces and other characters into single dashes", () => {
    expect(cleanSource("  Obesity Site / Popup!! ")).toBe("obesity-site-popup");
    expect(cleanSource("fb.ads_2026")).toBe("fb.ads_2026");
  });
  it("takes the first of a repeated query value", () => {
    expect(cleanSource(["Email", "other"])).toBe("email");
  });
  it("is null when nothing usable is left", () => {
    expect(cleanSource("")).toBeNull();
    expect(cleanSource("!!!")).toBeNull();
    expect(cleanSource(undefined)).toBeNull();
    expect(cleanSource(42)).toBeNull();
  });
  it("caps the tag at 50 characters with no dash left at the end", () => {
    const tag = cleanSource(`${"a".repeat(49)} b`);
    expect(tag).toBe("a".repeat(49));
    expect(cleanSource("x".repeat(80))?.length).toBe(50);
  });
  it("always gives a tag the database accepts", () => {
    for (const raw of ["Hello World", "--a--", "ÄÖÜ tag", "a".repeat(60), "x y z . _ -"]) {
      const tag = cleanSource(raw);
      if (tag) expect(tag).toMatch(/^[a-z0-9._-]{1,50}$/);
    }
  });
});

describe("trackedLink", () => {
  it("adds utm_source to the registration link", () => {
    expect(trackedLink("https://ecphub.vercel.app/e/mybestme/register", "obesity-site-popup"))
      .toBe("https://ecphub.vercel.app/e/mybestme/register?utm_source=obesity-site-popup");
  });
  it("works on an event's own address", () => {
    expect(trackedLink("https://register.example.com/register", "email")).toBe("https://register.example.com/register?utm_source=email");
  });
});

describe("countsAsRegistration", () => {
  it("counts new people, not someone already on the list", () => {
    expect(countsAsRegistration("registered")).toBe(true);
    expect(countsAsRegistration("waiting")).toBe(true);
    expect(countsAsRegistration("pending")).toBe(true);
    expect(countsAsRegistration("updated")).toBe(false);
  });
});
