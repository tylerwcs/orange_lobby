"use client";
import { useFormStatus } from "react-dom";

/** One half of a captain's A | B switch on My team (D724): filled when the person is on that side, busy while the change runs. */
export function TrackSwitchButton({ side, on, label, confirm = null }: {
  side: "A" | "B"; on: boolean; label: string;
  /** D726: asked before a move that would remove what the person logged today; null asks nothing. */
  confirm?: string | null;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" aria-label={label} aria-pressed={on} disabled={pending} aria-busy={pending}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
      className={`h-7 min-w-8 px-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60 ${
        on ? "bg-foreground text-background" : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
      {side}
    </button>
  );
}
