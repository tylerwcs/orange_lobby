import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// --- pure WCAG 2.x relative luminance + contrast ratio helpers (sRGB) ---

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`not a hex color: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function srgbChannelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(srgbChannelToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

// --- read the real tokens out of globals.css so this test tracks the source of truth ---

function readRootTokens(): Record<string, string> {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const rootMatch = /:root\s*\{([^}]*)\}/.exec(css);
  if (!rootMatch) throw new Error("could not find :root block in globals.css");
  const body = rootMatch[1];
  const tokens: Record<string, string> = {};
  const re = /--([\w-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    tokens[m[1]] = m[2];
  }
  return tokens;
}

const tokens = readRootTokens();
const WHITE = "#FFFFFF";
const MIN_RATIO = 4.5;
const MIN_NON_TEXT = 3;

function assertPair(textName: string, groundName: string, groundHex?: string, minRatio: number = MIN_RATIO) {
  const textHex = tokens[textName];
  const bgHex = groundHex ?? tokens[groundName];
  if (!textHex) throw new Error(`token --${textName} not found in :root`);
  if (!bgHex) throw new Error(`token --${groundName} not found in :root`);
  const ratio = contrastRatio(textHex, bgHex);
  expect(
    ratio,
    `--${textName} (${textHex}) on --${groundName} (${bgHex}) is ${ratio.toFixed(2)}:1, below the required ${minRatio}:1`
  ).toBeGreaterThanOrEqual(minRatio);
}

function assertNonTextPair(textName: string, groundName: string, groundHex?: string) {
  assertPair(textName, groundName, groundHex, MIN_NON_TEXT);
}

describe("token contrast (WCAG 2.x, sRGB)", () => {
  it("helper: contrastRatio(#000000, #FFFFFF) is 21:1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });

  it("ok-strong on ok-soft meets 4.5:1", () => assertPair("ok-strong", "ok-soft"));
  it("ok-strong on surface meets 4.5:1", () => assertPair("ok-strong", "surface"));
  it("warn on warn-soft meets 4.5:1", () => assertPair("warn", "warn-soft"));
  it("danger-strong on danger-soft meets 4.5:1", () => assertPair("danger-strong", "danger-soft"));
  it("brand-ink on brand-soft meets 4.5:1", () => assertPair("brand-ink", "brand-soft"));
  it("muted on tint-slate meets 4.5:1", () => assertPair("muted", "tint-slate"));
  it("muted on surface meets 4.5:1", () => assertPair("muted", "surface"));
  it("muted on canvas meets 4.5:1", () => assertPair("muted", "canvas"));
  it("ink on canvas meets 4.5:1", () => assertPair("ink", "canvas"));
  it("ink on surface meets 4.5:1", () => assertPair("ink", "surface"));

  it("white text on brand-strong fill meets 4.5:1", () => assertPair("brand-strong", "white", WHITE));
  it("white text on ok-strong fill meets 4.5:1", () => assertPair("ok-strong", "white", WHITE));
});

describe("non-text UI contrast (WCAG 2.x, sRGB, D43 3:1 tier)", () => {
  it("brand-strong on surface meets 3:1 (arrivals chart bars)", () => assertNonTextPair("brand-strong", "surface"));
  it("ok-strong on tint-slate meets 3:1 (Meter fill against its track)", () => assertNonTextPair("ok-strong", "tint-slate"));
  it("ok on surface meets 3:1 (status dots)", () => assertNonTextPair("ok", "surface"));
});
