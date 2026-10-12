import { describe, expect, it } from "vitest";
import { hexToLch, normaliseHex, tintedIcon, tintFor } from "@/lib/tint";

describe("tintFor (D488)", () => {
  it("leaves the art alone in its own orange, or one too close to tell apart", () => {
    expect(tintFor("f97316")).toBeNull();
    expect(tintFor("f87416")).toBeNull();
  });

  it("turns the hue to the event's colour", () => {
    const t = tintFor("005cb9")!;
    const turned = (hexToLch("f97316").h + t.hue) % 360;
    expect(Math.abs(turned - hexToLch("005cb9").h)).toBeLessThan(1);
  });

  it("keeps a dark but coloured brand recognisably coloured, and lets a grey be grey", () => {
    expect(tintFor("0f172a")!.saturation).toBe(0.35);
    expect(tintFor("6b6b6b")!.saturation).toBeLessThan(0.05);
    expect(tintFor("7c3aed")!.saturation).toBe(1);
  });
});

describe("tintedIcon", () => {
  it("tints the portal's own pictures only", () => {
    expect(tintedIcon("/portal-icons/agenda.webp", "#005CB9")).toBe("/portal-icons/tint/agenda/005cb9");
    expect(tintedIcon("/portal-icons/floor-plan.webp", "#005cb9")).toBe("/portal-icons/tint/floor-plan/005cb9");
    expect(tintedIcon("https://x.supabase.co/logo.png", "#005cb9")).toBe("https://x.supabase.co/logo.png");
    expect(tintedIcon(null, "#005cb9")).toBeNull();
  });

  it("serves the original for the default colour or a colour it cannot read", () => {
    expect(tintedIcon("/portal-icons/info.webp", "#F97316")).toBe("/portal-icons/info.webp");
    expect(tintedIcon("/portal-icons/info.webp", "blue")).toBe("/portal-icons/info.webp");
    expect(tintedIcon("/portal-icons/info.webp", null)).toBe("/portal-icons/info.webp");
  });

  it("reads a colour with or without its hash, in either case", () => {
    expect(normaliseHex("#ABCDEF")).toBe("abcdef");
    expect(normaliseHex("abcdef")).toBe("abcdef");
    expect(normaliseHex("#abc")).toBeNull();
  });
});
