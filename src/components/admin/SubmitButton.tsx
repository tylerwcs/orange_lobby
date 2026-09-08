"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className={`inline-flex min-h-11 items-center justify-center rounded-[var(--radius-control)] bg-brand px-4 text-sm font-bold text-ink disabled:opacity-50 ${className}`}>
      {pending ? "Working…" : children}
    </button>
  );
}
