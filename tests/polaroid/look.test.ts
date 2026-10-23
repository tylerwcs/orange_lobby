import { describe, expect, it } from "vitest";
import { cardLook, PLAIN_INK } from "@/features/polaroid/lib/look";

const BG = "https://x.supabase.co/bg.webp";

describe("cardLook (D718)", () => {
  it("is the plain polaroid with nothing set", () => {
    expect(cardLook({ background: null, logo: null, ink: null })).toEqual({ background: null, logo: null, ink: PLAIN_INK });
  });
  it("writes in white on a print background", () => {
    expect(cardLook({ background: BG, logo: null, ink: null }).ink).toBe("#ffffff");
  });
  it("keeps the admin's colour whatever the background", () => {
    expect(cardLook({ background: BG, logo: null, ink: "#e8c38a" }).ink).toBe("#e8c38a");
    expect(cardLook({ background: null, logo: null, ink: "#ff0000" }).ink).toBe("#ff0000");
  });
});
