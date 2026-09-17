import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ConfirmButton's confirmation renders inside an AlertDialog, and AlertDialogContent wraps
 * its children in a Base UI Portal — so everything in the dialog lands at the end of
 * <body>, outside whatever form the button was written in.
 *
 * A `<button type="submit">` there has no owning form (`button.form === null`), so clicking
 * it fires no submit event and the server action never runs. No console error, no network
 * request, nothing: every ConfirmButton on the site was a silent no-op, which is how
 * deleting a checkpoint came to do nothing at all.
 *
 * This cannot be caught by a unit test — there is no DOM here, and the behaviour belongs to
 * the browser rather than to our code — so it is guarded the same way the Tailwind
 * class-name rule is in agenda-colours.test.ts: by reading the source and refusing the
 * shape that breaks.
 */
const read = (p: string) => readFileSync(p, "utf8");
/**
 * Comments stripped before matching: both files explain the trap in prose, and a rule about
 * what the JSX may contain must not be satisfied — or broken — by the paragraph describing it.
 */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const SOURCE = read("src/components/admin/ConfirmButton.tsx");
const DANGER = read("src/components/admin/DangerButton.tsx");

describe("ConfirmButton", () => {
  it("never puts a submit button inside the dialog, where the portal strips its form", () => {
    expect(code(SOURCE)).not.toMatch(/type=["']submit["']/);
  });

  it("submits the form the trigger belongs to, rather than relying on the button's own", () => {
    // The trigger is NOT portalled — it renders where it was written, inside the form — so
    // it is the only handle on that form the dialog can reach. requestSubmit() fires a real
    // submit event, which is what React's `action` prop listens for.
    expect(code(SOURCE)).toMatch(/requestSubmit\(\)/);
    expect(code(SOURCE)).toMatch(/\.form\b/);
  });

  it("keeps its promise that the dialog's action is what runs the submit", () => {
    // The component's own doc comment is the contract a reader trusts. If the mechanism
    // changes again, the comment has to change with it.
    expect(SOURCE).toMatch(/portal/i);
  });

  it("leaves DangerButton alone: it has no form, and must not grow one", () => {
    // DangerButton exists precisely because a form cannot nest inside another form. It
    // calls the bound action in a transition and never touches form association, so the
    // portal cannot hurt it — and it must not be "fixed" into using requestSubmit.
    expect(code(DANGER)).toMatch(/startTransition/);
    expect(code(DANGER)).not.toMatch(/requestSubmit/);
    expect(code(DANGER)).not.toMatch(/type=["']submit["']/);
  });
});
