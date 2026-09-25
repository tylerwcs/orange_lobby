"use client";
import { useState, useTransition } from "react";
import type { EventStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Draft / Live / Archived, applied the moment one is chosen.
 *
 * Plain buttons calling the action, not a form per status: this sits on Settings' Event
 * details tab, inside the one form that saves every tab (see SaveBar there), and a form may
 * not hold another. `type="button"` also keeps Enter in the Name field from landing here —
 * the first submit button in a form is the one Enter presses.
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
