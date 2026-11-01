import { describe, expect, it } from "vitest";
import { MAP_LINK_ERROR, parseMapLink, readMapLink } from "@/features/activities/lib/map-link";

describe("parseMapLink (D798)", () => {
  it("keeps a web address and treats blank as none", () => {
    expect(parseMapLink("https://maps.app.goo.gl/abc123")).toEqual({ ok: true, url: "https://maps.app.goo.gl/abc123" });
    expect(parseMapLink("  ")).toEqual({ ok: true, url: null });
    expect(parseMapLink(null)).toEqual({ ok: true, url: null });
  });

  it("gives a pasted link without its scheme https://", () => {
    expect(parseMapLink("maps.app.goo.gl/abc123")).toEqual({ ok: true, url: "https://maps.app.goo.gl/abc123" });
  });

  it("refuses words, other schemes and hosts without a dot", () => {
    for (const bad of ["Level 3 gym", "javascript:alert(1)", "mailto:a@b.com", "https://localhost/x", "ftp://maps.example.com"]) {
      expect(parseMapLink(bad)).toEqual({ ok: false, error: MAP_LINK_ERROR });
    }
  });

  it("throws the organiser's sentence through readMapLink", () => {
    expect(() => readMapLink("Level 3")).toThrow(MAP_LINK_ERROR);
  });
});
