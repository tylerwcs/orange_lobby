"use client";
import { useTransition } from "react";

/**
 * A destructive action with no form of its own. `ConfirmButton` needs one, which makes it
 * unusable next to a Save button — a form cannot nest inside another form, and these two
 * belong in the same row. Calling the bound action inside a transition does the same job
 * without the element.
 */
export function DangerButton({ action, message, children }: {
  action: () => Promise<void>;
  message: string;
  children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button" disabled={pending} aria-busy={pending}
      onClick={() => { if (confirm(message)) startTransition(() => action()); }}
      className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-4 text-sm font-bold text-danger-strong transition-colors duration-150 hover:bg-danger-soft disabled:opacity-50"
    >
      {pending && <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-danger-strong/40 border-t-danger-strong" />}
      {pending ? "Working…" : children}
    </button>
  );
}
