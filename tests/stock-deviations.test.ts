import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * shadcn components live in this repo as source, so `shadcn add --overwrite` (or a future
 * `shadcn` upgrade) can quietly restore the stock version of a file we deliberately
 * changed - with no build error and no failing behaviour test, because the stock file is
 * perfectly valid code. These are the deviations, and this is what notices.
 *
 * They assert on SOURCE, not behaviour: the project has no DOM test environment, and
 * adding jsdom and testing-library to guard two files was not a trade worth making before
 * the KOM freeze. A source guard catches the exact failure being guarded against - the
 * file reverting to stock - which a behaviour test would catch no better.
 *
 * The third deviation, Badge's success/warning variants (D62), is guarded properly by
 * tests/badge-variants.test.ts, which calls the real thing.
 *
 * If one of these fails after an upgrade: re-apply the deviation, or delete the guard
 * deliberately because the upstream version now handles it.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Comments stripped, because these files explain their own deviation - and a comment
 * saying "stock ships useEffect" would otherwise fail an assertion that no useEffect is
 * present. Only what runs counts.
 */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("use-mobile.ts stays off setState-in-effect", () => {
  const src = code("src/hooks/use-mobile.ts");

  it("uses useSyncExternalStore", () => {
    // Stock ships useState + useEffect, which this project's eslint rejects outright
    // (react-hooks/set-state-in-effect), so a revert breaks `npm run lint` too. This says
    // why, where lint only says what.
    expect(src).toContain("useSyncExternalStore");
  });

  it("does not set state inside an effect", () => {
    expect(src).not.toContain("useEffect");
    expect(src).not.toContain("setIsMobile");
  });

  it("gives the server a snapshot, so SSR does not render the mobile layout", () => {
    // The third argument to useSyncExternalStore. Without it the hook throws during SSR.
    expect(src).toMatch(/\(\)\s*=>\s*false/);
  });
});

describe("checkbox.tsx shows a partial selection as partial", () => {
  const src = code("src/components/ui/checkbox.tsx");

  it("renders a minus for the indeterminate state", () => {
    // Stock renders only CheckIcon, so "some rows selected" looked identical to "all rows
    // selected" in the attendee table's header checkbox.
    expect(src).toContain("MinusIcon");
    expect(src).toContain("group-data-indeterminate/checkbox:block");
  });

  it("keeps the tick for the fully-checked state", () => {
    expect(src).toContain("CheckIcon");
    expect(src).toContain("group-data-indeterminate/checkbox:hidden");
  });

  it("still carries the group the variants hang off", () => {
    expect(src).toContain("group/checkbox");
  });
});
