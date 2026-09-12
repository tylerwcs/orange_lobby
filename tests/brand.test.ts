import { describe, it, expect } from "vitest";
import { brandContrast, brandStyle } from "@/lib/brand";
import { contrastRatio, hexToRgb, readableOn, darkenUntilReadable, toHex } from "@/lib/contrast";

const rgb = (hex: string) => hexToRgb(hex)!;

describe("contrast helpers", () => {
  it("agrees with the known poles", () => {
    expect(contrastRatio(rgb("#000000"), rgb("#FFFFFF"))).toBeCloseTo(21, 1);
    expect(contrastRatio(rgb("#FFFFFF"), rgb("#FFFFFF"))).toBeCloseTo(1, 5);
  });

  it("rejects anything that is not a six-digit hex", () => {
    for (const bad of ["orange", "#12", "#GGGGGG", ""]) expect(hexToRgb(bad)).toBeNull();
  });

  it("picks the readable foreground for a fill, not a fixed one", () => {
    // A deep navy takes white; a pale yellow takes ink. Picking one and hoping is the bug.
    expect(readableOn(rgb("#1D4ED8")).hex).toBe("#FFFFFF");
    expect(readableOn(rgb("#FDE047")).hex).toBe("#111827");
  });

  it("darkens only until a fill can carry white text", () => {
    const already = rgb("#1D4ED8");
    expect(toHex(darkenUntilReadable(already))).toBe(toHex(already));

    const pale = darkenUntilReadable(rgb("#FDE047"));
    expect(contrastRatio(pale, rgb("#FFFFFF"))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("brandStyle", () => {
  it("keeps the organiser's colour on --brand and darkens only --primary", () => {
    // --primary is read as text on white as well as a fill, so it has to be dark enough to
    // read; --brand is the colour as chosen, for decorative fills. One token cannot do both.
    const pale = brandStyle("#FFB066");
    expect(pale["--brand"]).toBe("#FFB066");
    expect(pale["--primary"]).not.toBe("#FFB066");
  });

  it("darkens in Oklab, so an orange stays orange", () => {
    // Scaling rgb channels instead turned #F97316 into #986A3E, a brown.
    const [r, g, b] = hexToRgb(brandStyle("#F97316")["--primary"])!;
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    // Still recognisably saturated, not a grey-brown.
    expect(r - b).toBeGreaterThan(80);
  });

  it("maps the event colour onto the tokens shadcn components read", () => {
    const style = brandStyle("#1D4ED8");
    expect(style["--primary"]).toBe("#1D4ED8");
    expect(style["--primary-foreground"]).toBe("#FFFFFF");
    expect(style["--ring"]).toBe("#1D4ED8");
    expect(style["--accent"]).toContain("color-mix(");
  });

  it("still emits the brand aliases the scanner and register flow read", () => {
    const style = brandStyle("#1D4ED8");
    expect(style["--brand"]).toBe("#1D4ED8");
    expect(style["--brand-ink"]).toBeTruthy();
    expect(style["--brand-soft"]).toContain("#1D4ED8");
  });

  it.each([["orange"], [null], ["#12"]])("falls back to #F97316 for invalid value %p", (value) => {
    expect(brandStyle(value as string | null)["--brand"]).toBe("#F97316");
  });

  it("falls back to #F97316 for undefined", () => {
    expect(brandStyle(undefined)["--brand"]).toBe("#F97316");
  });
});

// The finding this exists to close: the 8 Sep audit measured an event mark at 3.97:1, and
// it survived the 10 Sep redesign because nothing in the code could see it. Now it can.
describe("every event colour ships readable", () => {
  const colours = [
    "#F97316", // the default orange
    "#1D4ED8", // deep blue
    "#FDE047", // pale yellow, the case that used to fail
    "#22C55E", // mid green
    "#EC4899", // pink
    "#000000", // black
    "#FFFFFF", // white, the worst case for a fill
    "#9CA3AF", // mid grey
  ];

  it.each(colours)("%s carries its own foreground at 4.5:1", (hex) => {
    expect(brandContrast(hex)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(colours)("%s is readable as text on a white card", (hex) => {
    // text-primary on --card. This is the pairing the pale-orange event was failing at
    // about 1.9:1 before --primary stopped being the raw colour.
    const primary = hexToRgb(brandStyle(hex)["--primary"])!;
    expect(contrastRatio(primary, hexToRgb("#FFFFFF")!)).toBeGreaterThanOrEqual(4.5);
  });
});
