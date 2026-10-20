import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Every press has to answer. A submit that shows nothing until the redirect lands reads as a
 * press that did not register, and on a phone at a venue that is long enough to press again.
 *
 * Two guards, both by reading source (there is no DOM in this suite, see confirm-button.test):
 *
 * - A submit button is `SubmitButton`, or a control that reads `useFormStatus` itself
 *   (`ConfirmButton`). A raw `type="submit"` anywhere else has no working state.
 * - Every page sits under a `loading.tsx`, so a navigation to it swaps to a skeleton at once.
 */
function files(dir: string, name?: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return files(path, name);
    return (name ? entry === name : path.endsWith(".tsx")) ? [path] : [];
  });
}

const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/** Files allowed a raw submit: they read the form's pending state themselves. */
const OWN_PENDING = /\buseFormStatus\b|\buseActionState\b/;

describe("submit buttons", () => {
  it("have a working state wherever they appear", () => {
    const offenders = files("src").filter((f) => {
      const src = code(readFileSync(f, "utf8"));
      return /type=["']submit["']/.test(src) && !OWN_PENDING.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("include the confirmed ones", () => {
    // ConfirmButton submits through requestSubmit() rather than a submit button, so the
    // check above cannot see it. It has to read the form's status on its own.
    expect(code(readFileSync("src/components/admin/ConfirmButton.tsx", "utf8"))).toMatch(/useFormStatus\(\)/);
  });

  it("keep the registration form out from under a skeleton", () => {
    expect(SENT_WHOLE.filter(coveredByLoading)).toEqual([]);
  });
});

/**
 * Pages with nothing to wait for: they render from constants, so a skeleton would only
 * flash. Anything that reads the database does not belong here.
 */
const STATIC_PAGES = ["src/app/page.tsx", "src/app/login/page.tsx", "src/app/privacy/page.tsx", "src/app/privacy/ms/page.tsx"].map((p) => join(p));

/**
 * D709: pages sent whole, on purpose. Under a loading boundary a page arrives as the skeleton
 * plus hidden HTML that an inline script swaps in, and a browser that does not run it is left
 * on the skeleton. The registration form is opened cold by strangers on any phone, so it waits
 * for its data and arrives complete instead.
 */
const SENT_WHOLE = ["src/app/e/[slug]/register/page.tsx", "src/app/e/[slug]/register/done/page.tsx"].map((p) => join(p));

function coveredByLoading(page: string): boolean {
  for (let dir = dirname(page); dir.startsWith(join("src", "app")); dir = dirname(dir)) {
    if (existsSync(join(dir, "loading.tsx"))) return true;
  }
  return false;
}

describe("page routes", () => {
  it("each show a skeleton while they load", () => {
    const bare = files(join("src", "app"), "page.tsx").filter((p) => !STATIC_PAGES.includes(p) && !SENT_WHOLE.includes(p) && !coveredByLoading(p));
    expect(bare).toEqual([]);
  });

  it("keep the registration form out from under a skeleton", () => {
    expect(SENT_WHOLE.filter(coveredByLoading)).toEqual([]);
  });
});
