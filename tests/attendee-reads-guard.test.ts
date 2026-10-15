import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * D590/D591: every query that selects from `attendees` either keeps cancelled people out
 * (`.is("cancelled_at", null)`) or says on purpose that it includes them, with the marker
 * comment `any-status:` and a reason inside the same statement. New readers must choose.
 * Keep `;` out of the reason: the statement is cut at the first one.
 */
const SRC = join(process.cwd(), "src");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : []; });
}

describe("attendee reads guard (D591)", () => {
  it("every select from attendees filters cancelled people or is marked any-status", () => {
    const offenders: string[] = [];
    for (const p of walk(SRC)) {
      const src = readFileSync(p, "utf8");
      const re = /\.from\("attendees"\)\s*\.select\(/g;
      for (let m; (m = re.exec(src)); ) {
        // The statement: from the line above the select (a comment there counts) but never back
        // past the previous `;`, to the end of the line holding the next `;` (a trailing comment counts).
        const lineStart = src.lastIndexOf("\n", m.index);
        const prevLine = lineStart > 0 ? src.lastIndexOf("\n", lineStart - 1) + 1 : 0;
        const start = Math.max(prevLine, src.lastIndexOf(";", m.index) + 1);
        const semi = src.indexOf(";", m.index);
        const eol = semi === -1 ? -1 : src.indexOf("\n", semi);
        const stmt = src.slice(start, eol === -1 ? undefined : eol);
        const ok = stmt.includes('.is("cancelled_at", null)') || /any-status:/.test(stmt);
        if (!ok) offenders.push(`${relative(SRC, p).split("\\").join("/")}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
