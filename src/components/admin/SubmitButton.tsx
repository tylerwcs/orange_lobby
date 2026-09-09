"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      aria-busy={pending}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand px-4 text-sm font-bold text-ink transition-colors duration-150 hover:brightness-95 active:translate-y-px disabled:opacity-50 ${className}`}>
      {pending && <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/30 border-t-ink" />}
      {pending ? "Working…" : children}
    </button>
  );
}
