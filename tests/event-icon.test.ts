import { describe, expect, it } from "vitest";
import { eventIconUrl, iconVersion, isIconVariant, logoPath } from "@/lib/event-icon";

const SB = "https://x.supabase.co";
const ours = `${SB}/storage/v1/object/public/event-media/org/ev/logo-1.png`;

describe("event icon (D487)", () => {
  it("draws only a logo from our own bucket", () => {
    expect(logoPath({ logo_url: ours }, SB)).toBe("org/ev/logo-1.png");
    expect(logoPath({ logo_url: "https://elsewhere.com/logo.png" }, SB)).toBeNull();
    expect(logoPath({ logo_url: null }, SB)).toBeNull();
  });

  it("serves under the event's own path, versioned by the logo", () => {
    const url = eventIconUrl({ slug: "ecpkom", logo_url: ours }, "apple", SB);
    expect(url).toBe(`/e/ecpkom/app-icon/apple?v=${iconVersion(ours)}`);
    expect(eventIconUrl({ slug: "ecpkom", logo_url: null }, "apple", SB)).toBeNull();
  });

  it("gives a replaced logo a new version", () => {
    expect(iconVersion(ours)).not.toBe(iconVersion(ours.replace("logo-1", "logo-2")));
  });

  it("knows its variants and nothing else", () => {
    expect(["favicon", "apple", "192", "512", "maskable"].every(isIconVariant)).toBe(true);
    expect(isIconVariant("toString")).toBe(false);
    expect(isIconVariant("1024")).toBe(false);
  });
});
