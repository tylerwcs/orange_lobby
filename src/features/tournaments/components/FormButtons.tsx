"use client";
import { useFormStatus } from "react-dom";
import { X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

/** The ✕ on a player's name chip: small, with a spinner while the removal runs. */
export function ChipRemoveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" aria-label={label} disabled={pending} aria-busy={pending}
      className="-mr-1 inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60">
      {pending ? <Spinner /> : <X className="size-3.5" />}
    </button>
  );
}
