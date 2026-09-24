"use client";
import { useFormStatus } from "react-dom";

/**
 * The one Open/Closed control every activity kind shares, on its list row and in its page's
 * header (D127: open is one click, never a field inside a settings form).
 *
 * A form around a real submit button, so it works before hydration and posts to the bound
 * server action like every other control here. While the action is in flight the switch shows
 * where it is going, not where it was: at a venue the round trip is long enough to look like
 * the click did nothing, and a second click would flip it straight back.
 */
export function OpenSwitch({ open, action, name, showLabel = false }: {
  open: boolean;
  action: () => Promise<void>;
  /** The activity's name, for the accessible label: "Open InBody Scan". */
  name: string;
  /** Words beside the switch, for a page header where there is no column heading to explain it. */
  showLabel?: boolean;
}) {
  return (
    <form action={action}>
      <Switch open={open} name={name} showLabel={showLabel} />
    </form>
  );
}

function Switch({ open, name, showLabel }: { open: boolean; name: string; showLabel: boolean }) {
  const { pending } = useFormStatus();
  const on = pending ? !open : open;
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={on}
      aria-label={`Open ${name}`}
      disabled={pending}
      className="group inline-flex items-center gap-2 rounded-full text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-progress"
    >
      <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${on ? "bg-success" : "bg-input"}`}>
        <span className={`size-4 rounded-full bg-white shadow-sm transition-transform ${on ? "translate-x-4.5" : "translate-x-0.5"}`} />
      </span>
      {showLabel && <span className={on ? "text-success-strong" : "text-muted-foreground"}>{on ? "Open" : "Closed"}</span>}
    </button>
  );
}
