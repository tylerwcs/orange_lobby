"use client";
import { useFormStatus } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** A squad member's ✕: a spinner while the removal runs, so the press visibly registers. */
export function RemoveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="icon-sm" aria-label={label} disabled={pending} aria-busy={pending}>
      {pending ? <Spinner /> : <X />}
    </Button>
  );
}

/** One name in the member picker, as a button that shows it is working once pressed. */
export function PickButton({ name, hint }: { name: string; hint: string | null }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending}
      className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-60">
      <span className="flex flex-col">
        <span className="font-semibold">{name}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
      {pending && <Spinner />}
    </button>
  );
}
