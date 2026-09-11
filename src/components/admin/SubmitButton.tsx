"use client";
import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonVariant } from "../ui/Card";

export function SubmitButton({ children, className = "", variant = "primary" }: { children: React.ReactNode; className?: string; variant?: ButtonVariant }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      aria-busy={pending}
      className={`${buttonClass(variant)} ${className}`}>
      {pending && <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {pending ? "Working…" : children}
    </button>
  );
}
