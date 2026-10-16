import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { contrastRatio, hexToRgb } from "@/lib/contrast";
import { EMPTY_THEME, themeTokens, type EventTheme } from "@/features/theme/client";

/**
 * Final review 1, Critical 1: organiser rich text (`.rich-text prose`) drew Tailwind Typography's
 * fixed greys, unreadable on a dark theme. globals.css maps the prose colours to the theme; this
 * reads that mapping out of globals.css and resolves it the way the browser does.
 */
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const block = /^\.rich-text\s*\{([\s\S]*?)\n\}/m.exec(css)?.[1] ?? "";
const mapping: Record<string, string> = {};
for (const m of block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--tw-prose-[\w-]+):\s*([^;]+);/g)) mapping[m[1]] = m[2].trim();

// What `.prose` draws today: the plugin's default (gray) colours.
const plugin = createRequire(import.meta.url)("@tailwindcss/typography/src/styles.js") as { gray: { css: Record<string, string> } };
const TODAY = plugin.gray.css;

/** A prose variable as the browser resolves it: `var(--x, fallback)` against the theme's tokens, currentColor as the surface's text. */
function resolve(name: string, tokens: Record<string, string>, current: string): string {
  let v = mapping[name];
  for (let i = 0; i < 4; i++) {
    const m = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/.exec(v);
    if (!m) break;
    v = tokens[m[1]] ?? m[2] ?? `unset ${m[1]}`;
  }
  return v === "currentColor" ? current : v;
}

const r = (a: string, b: string) => contrastRatio(hexToRgb(a)!, hexToRgb(b)!);
const TEXT = ["--tw-prose-body", "--tw-prose-headings", "--tw-prose-bold", "--tw-prose-quotes", "--tw-prose-code", "--tw-prose-links", "--tw-prose-lead", "--tw-prose-counters", "--tw-prose-captions"];

describe("rich text follows the theme (final review 1, Critical 1)", () => {
  it("maps every colour prose draws text and rules with", () => {
    for (const k of [...TEXT, "--tw-prose-bullets", "--tw-prose-hr", "--tw-prose-quote-borders", "--tw-prose-th-borders", "--tw-prose-td-borders", "--tw-prose-kbd"])
      expect(mapping[k], k).toBeDefined();
    expect(mapping["--tw-prose-links"]).toBe("var(--primary)");
  });

  it("an untouched event resolves to exactly today's prose colours", () => {
    const { tokens } = themeTokens(EMPTY_THEME, "#005cb9");
    for (const k of Object.keys(mapping)) {
      if (k === "--tw-prose-links") continue; // `.rich-text a` has always drawn links in --primary
      expect(resolve(k, tokens, "ink"), k).toBe(TODAY[k]);
    }
  });

  const cases: [string, EventTheme, string][] = [
    ["uobih2", { ...EMPTY_THEME, background: "#000c36", overrides: { heading: "#ffffff" } }, "#005cb9"],
    ["black", { ...EMPTY_THEME, background: "#000000" }, "#005cb9"],
    ["black/gold", { ...EMPTY_THEME, background: "#000000" }, "#d9b25f"],
  ];
  it.each(cases)("%s: prose body, headings, links and captions read on the card and the page", (_, theme, p) => {
    const { tokens: t } = themeTokens(theme, p);
    for (const k of TEXT) {
      expect(r(resolve(k, t, t["--card-foreground"]), t["--card"]), `${k} on card`).toBeGreaterThanOrEqual(4.5);
      expect(r(resolve(k, t, t["--foreground"]), t["--background"]), `${k} on page`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("mixed polarity (a white card on navy): body and headings take the text around them, so read on both", () => {
    // Links and captions there are the engine's best effort (ruling: no one colour reads on both).
    const { tokens: t } = themeTokens({ ...EMPTY_THEME, background: "#000c36", overrides: { card: "#ffffff" } }, "#005cb9");
    for (const k of ["--tw-prose-body", "--tw-prose-headings", "--tw-prose-bold", "--tw-prose-quotes", "--tw-prose-code"]) {
      expect(r(resolve(k, t, t["--card-foreground"]), t["--card"]), `${k} on card`).toBeGreaterThanOrEqual(4.5);
      expect(r(resolve(k, t, t["--foreground"]), t["--background"]), `${k} on page`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(cases)("%s: event terms (prose on the muted fill inside the card) read", (_, theme, p) => {
    const { tokens: t } = themeTokens(theme, p);
    for (const k of TEXT) expect(r(resolve(k, t, t["--card-foreground"]), t["--muted"]), `${k} on muted`).toBeGreaterThanOrEqual(4.5);
  });
});
