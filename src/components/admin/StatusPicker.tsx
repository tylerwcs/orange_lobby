"use client";
import { useState, useTransition } from "react";
import type { EventStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Draft / Live / Archived, applied the moment one is chosen.
 *
 * Plain buttons calling the action, not a form per status. It sits on Settings' Event tab,
 * beside that tab's form (D778); `type="button"` keeps it from ever submitting a form it is
 * placed in, and keeps Enter in a field from landing here.
 */
export function StatusPicker({ current, statuses, setStatus }: {
  current: EventStatus;
  statuses: { value: EventStatus; label: string; what: string }[];
  setStatus: (status: EventStatus) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState<EventStatus | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <Button
            key={s.value}
            type="button"
            variant={current === s.value ? "default" : "outline"}
            aria-current={current === s.value ? "true" : undefined}
            disabled={pending}
            aria-busy={pending && choosing === s.value}
            onClick={() => { setChoosing(s.value); startTransition(() => setStatus(s.value)); }}
          >
            {pending && choosing === s.value && <Spinner data-icon="inline-start" />}
            {s.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{statuses.find((s) => s.value === current)?.what}</p>
    </div>
  );
}
