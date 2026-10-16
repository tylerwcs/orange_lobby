import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * D625/D628: attendee components read theme tokens, never a fixed colour. A line that must stay
 * fixed (a QR on white, a wash on the feature panel) says so with a `theme-fixed:` comment and a
 * reason on the same line. Same opt-out style as tests/attendee-reads-guard.test.ts's `any-status:`.
 * The polaroid camera stage and walk-in page are out of scope (spec non-goal).
 */
const ROOT = process.cwd();
const FIXED = /\b(text-white|bg-white(?!\/)|bg-black|bg-foreground|text-gray-\d+)(?![\w-])/;

const ROOTS = [
  "src/components/portal",
  "src/app/e",
  "src/features/activities/portal",
  "src/features/activities/kinds",
  "src/features/cancel/portal",
  "src/features/games/components/phone",
  "src/features/games/components/PlayClient.tsx",
];
const EXCLUDED = ["src/app/e/[slug]/polaroid/", "src/features/polaroid/"];

const norm = (p: string) => relative(ROOT, p).split("\\").join("/");
function walk(path: string): string[] {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return path.endsWith(".tsx") ? [path] : [];
  return readdirSync(path).flatMap((n) => walk(join(path, n)));
}

describe("attendee components read theme tokens (D625)", () => {
  it("no fixed white/black/gray colour class without a theme-fixed: reason", () => {
    const offenders: string[] = [];
    for (const r of ROOTS) {
      for (const p of walk(join(ROOT, r))) {
        const file = norm(p);
        if (EXCLUDED.some((x) => file.startsWith(x))) continue;
        readFileSync(p, "utf8").split("\n").forEach((line, i) => {
          if (FIXED.test(line) && !/theme-fixed:/.test(line)) offenders.push(`${file}:${i + 1}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
