import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Base UI's Button renders `type="button"` unless told otherwise. That is the right default
 * for a bare button and the wrong one inside a `<form action={...}>`: the element sits in the
 * form, `button.form` is the form, and clicking it still submits nothing. No submit event, no
 * server action, no console error — the status control on Settings sat like that, and "click
 * Live" did nothing at all.
 *
 * A plain <button> would have defaulted to submit and worked, which is what makes this
 * invisible on review: the JSX looks like every other form in the app.
 *
 * So inside a server-action form, a Button must say which kind it is. `type="submit"` to
 * submit; `type="button"` for a control that deliberately does something else (opening a
 * dialog, say). Either is fine — silence is not.
 */
function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

/** Every `<Button` opening tag that appears inside a form's action attribute's element. */
function untypedButtonsInActionForms(source: string): string[] {
  const out: string[] = [];
  const form = /<form\b[^>]*\baction=\{/g;
  let m: RegExpExecArray | null;
  while ((m = form.exec(source)) !== null) {
    // The form's children, up to its closing tag — enough to catch the button it wraps.
    const body = source.slice(m.index, source.indexOf("</form>", m.index) + 1);
    const button = /<Button\b([^>]*)>/g;
    let b: RegExpExecArray | null;
    while ((b = button.exec(body)) !== null) {
      if (!/\btype=/.test(b[1])) out.push(b[0].replace(/\s+/g, " ").slice(0, 80));
    }
  }
  return out;
}

describe("buttons inside server-action forms", () => {
  it("recognises an untyped Button in a form", () => {
    // Guard the guard: this is the exact shape that broke, and the detector must see it.
    expect(untypedButtonsInActionForms('<form action={go}><Button variant="outline">Live</Button></form>')).toHaveLength(1);
    expect(untypedButtonsInActionForms('<form action={go}><Button type="submit">Live</Button></form>')).toEqual([]);
    expect(untypedButtonsInActionForms('<Button variant="outline">Elsewhere</Button>')).toEqual([]);
  });

  it("leaves no Button in the app without an explicit type", () => {
    const offenders = tsxFiles("src").flatMap((f) => {
      const found = untypedButtonsInActionForms(readFileSync(f, "utf8"));
      return found.map((tag) => `${f}: ${tag}`);
    });
    expect(offenders).toEqual([]);
  });
});
