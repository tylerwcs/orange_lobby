"use client";
import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/ui/spinner";

export type AddOption = { id: string; name: string; alsoIn: string[] };

/**
 * D644: "Add a member" - a plain dropdown of the group's members not in this squad, each saying
 * what else they play. Choosing one adds them straight away (no second button), and the page
 * comes back with them in the squad. Keyed by the caller on the squad, so it resets after each add.
 */
export function AddMemberSelect({ sport, options, add }: { sport: string; options: AddOption[]; add: (fd: FormData) => Promise<void> }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={add}>
      <Picker sport={sport} options={options} onPick={() => form.current?.requestSubmit()} />
    </form>
  );
}

function Picker({ sport, options, onPick }: { sport: string; options: AddOption[]; onPick: () => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="relative">
      <select
        name="attendee" defaultValue="" disabled={pending} aria-label={`Add a member to ${sport}`} onChange={(e) => e.target.value && onPick()}
        className="h-10 w-full appearance-none rounded-lg border border-dashed border-input bg-transparent px-3 pr-9 text-sm font-semibold text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      >
        <option value="" disabled>+ Add a member</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.alsoIn.length ? `${o.name} · also in ${o.alsoIn.join(", ")}` : o.name}</option>)}
      </select>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">{pending ? <Spinner /> : "▾"}</span>
    </div>
  );
}
