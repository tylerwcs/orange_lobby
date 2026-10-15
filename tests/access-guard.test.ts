import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * D564: the access move fails closed only if nothing goes around it. This reads src/ and fails if
 * - anything outside the access module calls requireAdmin or requireEvent, or
 * - an admin-only check appears anywhere not listed below, or a different number of times.
 * Adding an admin-only control means adding it here on purpose.
 */
const SRC = join(process.cwd(), "src");
const ACCESS_FILES = new Set(["lib/auth.ts", "lib/db/events.ts", "lib/access.ts"]);

/** File → how many times each admin-only check is called in it (D553). */
const ADMIN_ONLY: Record<string, { requireOrgAdmin?: number; requireAdminEvent?: number }> = {
  "app/admin/events/[id]/actions.ts": { requireOrgAdmin: 1, requireAdminEvent: 2 }, // create; delete, purge
  "features/catalogue/admin/actions.ts": { requireAdminEvent: 1 }, // its event() helper
  "features/domains/admin/actions.ts": { requireAdminEvent: 1 }, // its event() helper
  "features/domains/admin/AddressTab.tsx": { requireAdminEvent: 1 },
  "features/committee/admin/actions.ts": { requireAdminEvent: 1 }, // its guard() helper (Task 5)
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}
const files = walk(SRC).map((p) => ({ rel: relative(SRC, p).split("\\").join("/"), src: readFileSync(p, "utf8") }));
const calls = (src: string, fn: string) => src.split(`${fn}(`).length - 1;

describe("access guard (D564)", () => {
  it("only the access module reaches requireAdmin and requireEvent", () => {
    const offenders = files
      .filter((f) => !ACCESS_FILES.has(f.rel))
      // Calls and imports, not comments: plenty of comments mention requireAdmin by name.
      .filter((f) => /\brequire(Admin|Event)\s*\(/.test(f.src) || /import[^;]*\brequire(Admin|Event)\b[^;]*from/.test(f.src))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("admin-only checks appear exactly where listed", () => {
    const found: Record<string, { requireOrgAdmin?: number; requireAdminEvent?: number }> = {};
    for (const f of files) {
      if (ACCESS_FILES.has(f.rel)) continue;
      const org = calls(f.src, "requireOrgAdmin");
      const ev = calls(f.src, "requireAdminEvent");
      if (org || ev) found[f.rel] = { ...(org ? { requireOrgAdmin: org } : {}), ...(ev ? { requireAdminEvent: ev } : {}) };
    }
    // The committee feature is created in Task 5; until then it is absent from both sides.
    const expected = Object.fromEntries(Object.entries(ADMIN_ONLY).filter(([rel]) => files.some((f) => f.rel === rel)));
    expect(found).toEqual(expected);
  });
});
