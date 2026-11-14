"use client";
import { useFormStatus } from "react-dom";
import { buttonVariants } from "@/components/ui/button";

/** A form's submit button that can ask first (D904: a track move removes today's entries) and is busy while the action runs. */
export function ConfirmSubmit({ children, confirm = null, variant = "outline", className = "" }: {
  children: React.ReactNode;
  /** Asked before submitting; null asks nothing. */
  confirm?: string | null;
  variant?: "default" | "outline" | "link";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
      className={`${buttonVariants({ variant, size: variant === "link" ? "sm" : "lg" })} ${variant === "link" ? "h-auto px-0" : "h-11 rounded-full px-4 font-bold"} ${className}`}>
      {children}
    </button>
  );
}
