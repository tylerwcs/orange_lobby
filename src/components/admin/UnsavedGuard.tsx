"use client";
import { useEffect } from "react";
import { formsLost, unsavedChangesMessage } from "@/lib/unsaved-changes";

const TAB_FORM = "form[data-tab-label]";

/**
 * D778: each Settings tab is its own form, and every save redirects through flashPath, which
 * shows loading.tsx and mounts the page afresh (remembered-tab.ts). So saving one tab loses
 * what is typed but unsaved on every other. This asks first.
 *
 * A `data-tab-label` form turns dirty, and gets `data-dirty` (which its SaveBar shows as
 * "Unsaved changes"), on its first `input` or `change` event, or a click on one of its
 * `type="button"` buttons: adding, moving or removing a question, an image's Remove, a theme
 * Reset, the terms editor's toolbar. Submitting ANY form on the page (another tab's, the Me page
 * form, a dialog, a What's on switch) while tab forms other than itself are dirty names them all
 * and asks; a tab form's own edits never do. Status clicks are action calls, not submits, so they
 * are not covered. A submit that goes ahead clears its own form's mark, so a refused or no-change
 * save does not warn later.
 *
 * Listens on window in the capture phase, ahead of React's own submit handling at the root, and
 * a cancelled submit is one React does not run the action for. Renders nothing.
 */
export function UnsavedGuard() {
  useEffect(() => {
    const tabForm = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLFormElement>(TAB_FORM) : null);
    const markDirty = (form: HTMLFormElement | null) => form?.setAttribute("data-dirty", "");
    const edit = (e: Event) => markDirty(tabForm(e.target));
    const click = (e: Event) => {
      const button = e.target instanceof Element ? e.target.closest('button[type="button"]') : null;
      if (button) markDirty(tabForm(button));
    };
    const submit = (e: Event) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      const dirty = Array.from(document.querySelectorAll<HTMLFormElement>(`${TAB_FORM}[data-dirty]`));
      const lost = formsLost(form, dirty);
      if (lost.length > 0 && !window.confirm(unsavedChangesMessage(lost.map((f) => f.dataset.tabLabel ?? "another tab")))) {
        e.preventDefault();
        return;
      }
      // A submit that goes ahead clears its own mark (a tab form's own edits are the ones it saves).
      if (form.matches(TAB_FORM)) form.removeAttribute("data-dirty");
    };
    window.addEventListener("input", edit, true);
    window.addEventListener("change", edit, true);
    window.addEventListener("click", click, true);
    window.addEventListener("submit", submit, true);
    return () => {
      window.removeEventListener("input", edit, true);
      window.removeEventListener("change", edit, true);
      window.removeEventListener("click", click, true);
      window.removeEventListener("submit", submit, true);
    };
  }, []);
  return null;
}
