import type { ActivityControls } from "@/lib/activity-requests";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { SubmitButton } from "@/components/admin/SubmitButton";

/**
 * The attendee's own seat in one activity, and the only controls that act on it.
 *
 * Separated from the session rows deliberately: the control that undoes your afternoon used
 * to sit in the same column, in the same shape, as the control that booked it. Here there is
 * one statement of what you hold and one place to change it.
 */
export function ActivityBooking({ controls, pendingId, requestSwitch, requestCancel, withdraw }: {
  controls: ActivityControls;
  // The raw pending request's id: `controls.pending` (a `PendingSummary`) deliberately carries
  // no id — it is for rendering, not addressing — so the id travels alongside it. Bound here,
  // not by the caller, so a caller whose `pendingId` ever drifts from `controls.pending` gets a
  // form with no action (a harmless no-op reload) instead of a crash at render.
  pendingId: string | null;
  // Bound with the from-session only: the target session travels as the form's own `to`
  // field, so what remains after binding is a plain form action, `(fd: FormData) => ...`.
  requestSwitch: (fromSessionId: string, fd: FormData) => Promise<void>;
  requestCancel: (fromSessionId: string) => Promise<void>;
  withdraw: (requestId: string) => Promise<void>;
}) {
  const { holding, pending, declined, switchTargets, canRequestCancel } = controls;
  if (!holding && !pending && !declined) return null;

  if (pending) {
    return (
      <div className="rounded-[12px] bg-accent p-3 text-sm">
        <p className="font-bold text-accent-foreground">
          {pending.kind === "cancel"
            ? `Waiting for approval: cancel ${pending.fromTitle ?? "your session"}`
            : `Waiting for approval: move to ${pending.toTitle ?? "another session"}`}
        </p>
        <p className="mt-1 text-muted-foreground">
          Your seat is held until the desk agrees, so nothing has changed yet.
        </p>
        <form action={pendingId ? withdraw.bind(null, pendingId) : undefined} className="mt-2">
          <SubmitButton variant="outline">Withdraw request</SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2.5">
      {/* D153a: an approval needs no announcement — they are simply booked on the session
          they asked for. A decline would otherwise leave no trace at all. */}
      {declined && (
        <p className="text-sm text-warning">
          {declined.kind === "cancel"
            ? `The desk declined your request to cancel ${declined.fromTitle ?? "that session"}.`
            : `The desk declined your request to move to ${declined.toTitle ?? "another session"}.`}
        </p>
      )}
      {holding && (
        <>
          <p className="text-sm font-bold">You are booked on {holding.session.title}.</p>
          {switchTargets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other session has room right now.</p>
          ) : (
            <form action={requestSwitch.bind(null, holding.session.id)} className="flex flex-wrap items-center gap-2">
              {/* Scoped to the held session's id: a page with two such activities would
                  otherwise render this pair's id twice, leaving every select after the first
                  without an accessible name. */}
              <label htmlFor={`to-${holding.session.id}`} className="sr-only">Move to</label>
              <select id={`to-${holding.session.id}`} name="to" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 text-sm">
                {switchTargets.map((t) => (
                  <option key={t.session.id} value={t.session.id}>
                    {t.session.title} · {t.session.starts_at} · {t.left} left
                  </option>
                ))}
              </select>
              <ConfirmButton
                tone="default"
                confirmLabel="Send request"
                message="Your current seat is held until the desk agrees, so nothing changes yet."
              >
                Request switch
              </ConfirmButton>
            </form>
          )}
          {canRequestCancel && (
            <form action={requestCancel.bind(null, holding.session.id)}>
              <ConfirmButton
                tone="default"
                confirmLabel="Send request"
                message={`Ask the desk to cancel ${holding.session.title}? Your seat is held until they agree.`}
              >
                Request cancel
              </ConfirmButton>
            </form>
          )}
        </>
      )}
    </div>
  );
}
