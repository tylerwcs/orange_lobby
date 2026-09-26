import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Rgb = [number, number, number];

// --- OKLCH -> sRGB (Björn Ottosson's Oklab matrices), so the tokens can stay in shadcn's format ---

function gammaEncode(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

function oklchToRgb(L: number, C: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  return [
    gammaEncode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gammaEncode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gammaEncode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

// --- pure WCAG 2.x relative luminance + contrast ratio helpers (sRGB) ---

function srgbChannelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map(srgbChannelToLinear);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const lA = relativeLuminance(a);
  const lB = relativeLuminance(b);
  return (Math.max(lA, lB) + 0.05) / (Math.min(lA, lB) + 0.05);
}

function parseColor(value: string): Rgb {
  const hex = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value.trim());
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)];
  const ok = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(value.trim());
  if (ok) return oklchToRgb(Number(ok[1]), Number(ok[2]), Number(ok[3]));
  throw new Error(`not a colour this test can read: ${value}`);
}

// --- read the real tokens out of globals.css so this test tracks the source of truth ---

function readRootTokens(): Record<string, string> {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const rootMatch = /:root\s*\{([\s\S]*?)\n\}/.exec(css);
  if (!rootMatch) throw new Error("could not find :root block in globals.css");
  // Strip comments so the hex reference in `/* #F5F5F3 */` is never mistaken for a value.
  const body = rootMatch[1].replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens: Record<string, string> = {};
  const re = /--([\w-]+):\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) tokens[m[1]] = m[2].trim();
  return tokens;
}

const tokens = readRootTokens();

/** Follow `var(--x)` indirection so the transition aliases resolve to a real colour. */
function resolve(name: string, depth = 0): string {
  const raw = tokens[name];
  if (!raw) throw new Error(`token --${name} not found in :root`);
  if (depth > 8) throw new Error(`--${name} does not resolve to a colour (alias loop?)`);
  const v = /^var\(\s*--([\w-]+)\s*\)$/.exec(raw);
  return v ? resolve(v[1], depth + 1) : raw;
}

const rgb = (name: string): Rgb => parseColor(resolve(name));

const WHITE: Rgb = [255, 255, 255];
const MIN_RATIO = 4.5;
const MIN_NON_TEXT = 3;

function assertPair(textName: string, groundName: string, ground?: Rgb, minRatio: number = MIN_RATIO) {
  const text = rgb(textName);
  const bg = ground ?? rgb(groundName);
  const ratio = contrastRatio(text, bg);
  expect(
    ratio,
    `--${textName} (${resolve(textName)}) on --${groundName} (${ground ? "#FFFFFF" : resolve(groundName)}) is ${ratio.toFixed(2)}:1, below the required ${minRatio}:1`
  ).toBeGreaterThanOrEqual(minRatio);
}

function assertNonTextPair(textName: string, groundName: string, ground?: Rgb) {
  assertPair(textName, groundName, ground, MIN_NON_TEXT);
}

describe("colour helpers", () => {
  it("contrastRatio(black, white) is 21:1", () => {
    expect(contrastRatio([0, 0, 0], WHITE)).toBeCloseTo(21, 1);
  });

  it("converts the OKLCH poles to black and white", () => {
    expect(oklchToRgb(1, 0, 0)).toEqual([255, 255, 255]);
    expect(oklchToRgb(0, 0, 0)).toEqual([0, 0, 0]);
  });

  it("converts --primary back to the #C2410C it was authored from", () => {
    expect(rgb("primary")).toEqual([194, 65, 12]);
  });

});

describe("token contrast (WCAG 2.x, sRGB)", () => {
  it("success-strong on success-soft meets 4.5:1", () => assertPair("success-strong", "success-soft"));
  it("success-strong on card meets 4.5:1", () => assertPair("success-strong", "card"));
  it("warning on warning-soft meets 4.5:1", () => assertPair("warning", "warning-soft"));
  it("destructive-strong on destructive-soft meets 4.5:1", () => assertPair("destructive-strong", "destructive-soft"));
  // The scanner's result band: white type on the solid outcome colour.
  it("white on success-strong meets 4.5:1", () => assertPair("destructive-foreground", "success-strong"));
  it("white on warning meets 4.5:1", () => assertPair("destructive-foreground", "warning"));
  it("white on destructive-strong meets 4.5:1", () => assertPair("destructive-foreground", "destructive-strong"));
  it("accent-foreground on accent meets 4.5:1", () => assertPair("accent-foreground", "accent"));
  it("muted-foreground on muted meets 4.5:1", () => assertPair("muted-foreground", "muted"));
  it("muted-foreground on card meets 4.5:1", () => assertPair("muted-foreground", "card"));
  it("muted-foreground on background meets 4.5:1", () => assertPair("muted-foreground", "background"));
  it("foreground on background meets 4.5:1", () => assertPair("foreground", "background"));
  it("foreground on card meets 4.5:1", () => assertPair("foreground", "card"));

  it("primary-foreground on primary meets 4.5:1", () => assertPair("primary", "primary-foreground"));
  it("white text on success-strong fill meets 4.5:1", () => assertPair("success-strong", "white", WHITE));
  it("white text on destructive-strong fill meets 4.5:1 (error toast)", () => assertPair("destructive-strong", "white", WHITE));
  it("white text on foreground fill meets 4.5:1 (toast, bulk bar)", () => assertPair("foreground", "white", WHITE));
});

describe("non-text UI contrast (WCAG 2.x, sRGB, D43 3:1 tier)", () => {
  it("primary on card meets 3:1 (arrivals chart bars)", () => assertNonTextPair("primary", "card"));
  it("success-strong on muted meets 3:1 (Progress fill against its track)", () => assertNonTextPair("success-strong", "muted"));
  it("success on card meets 3:1 (status dots)", () => assertNonTextPair("success", "card"));
  it("every chart ink meets 3:1 on card", () => {
    for (const n of ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"]) assertNonTextPair(n, "card");
  });
});

// D64: --muted changed meaning on the shadcn migration. It is a BACKGROUND; the text colour it
// used to hold is --muted-foreground. Swapping them back would still render, just invisibly.
describe("D64 — --muted is a background, --muted-foreground is text", () => {
  it("--muted is lighter than --muted-foreground", () => {
    expect(relativeLuminance(rgb("muted"))).toBeGreaterThan(relativeLuminance(rgb("muted-foreground")));
  });

  it("--muted is a near-canvas ground, not a text colour", () => {
    expect(contrastRatio(rgb("muted"), rgb("card"))).toBeLessThan(1.5);
  });
});

// D72: --brand is the organiser's colour as chosen, for decorative fills only, paired with a
// foreground computed for it. brandStyle() replaces both per event - that pair is tested in
// tests/brand.test.ts, which can see the computed values; these are the defaults shipped here.
// There is deliberately no --brand-on-card assertion. The default orange is 2.83:1 on white,
// and it is allowed to be: it fills the event mark (whose initials are checked against it
// above) and the "happening now" dot, which sits beside the words "Happening now". Neither
// shape carries meaning the reader cannot get from the text on or next to it. What must hold
// is that whatever the organiser picks can be read ON, and that is this pair.
describe("D72 - the event colour pair", () => {
  it("brand-foreground on brand meets 4.5:1", () => assertPair("brand-foreground", "brand"));
});

it("resolves a token written as var() through to a real colour", () => {
  expect(rgb("brand-foreground")).toEqual(rgb("foreground"));
});
