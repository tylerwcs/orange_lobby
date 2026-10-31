"use client";
import { useEffect } from "react";

/**
 * D778: each Settings tab is its own form now, and every save ends in a redirect that renders
 * the page afresh, so saving one tab drops what is typed but unsaved on another. This asks first.
 *
 * A form with `data-tab-label` is dirty from its first `input` or `change` event. Each form is
 * keyed on its saved values and remounts after its own save, and the new element starts clean.
 * Submitting a tab's form while ANOTHER tab's form is dirty asks; a form's own edits never do.
 * Listens on window in the capture phase, ahead of React's own submit handling at the root, and
 * a cancelled submit is one React does not run the action for. Renders nothing.
 */
export function UnsavedGuard() {
  useEffect(() => {
    const dirty = new WeakSet<HTMLFormElement>();
    const tabForm = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLFormElement>("form[data-tab-label]") : null);
    const mark = (e: Event) => {
      const form = tabForm(e.target);
      if (form) dirty.add(form);
    };
    const submit = (e: Event) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || !form.matches("form[data-tab-label]")) return;
      const other = Array.from(document.querySelectorAll<HTMLFormElement>("form[data-tab-label]"))
        .find((f) => f !== form && dirty.has(f));
      if (other && !window.confirm(`You have unsaved changes on ${other.dataset.tabLabel}. Save anyway and lose them?`)) {
        e.preventDefault();
      }
    };
    window.addEventListener("input", mark, true);
    window.addEventListener("change", mark, true);
    window.addEventListener("submit", submit, true);
    return () => {
      window.removeEventListener("input", mark, true);
      window.removeEventListener("change", mark, true);
      window.removeEventListener("submit", submit, true);
    };
  }, []);
  return null;
}
