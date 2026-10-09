import type { ActivityControls } from "../../lib/activity-requests";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { Icon } from "@/components/ui/icon";
import { AddToCalendar } from "@/components/portal/AddToCalendar";
import { sessionLabel } from "../../lib/activities";
import { shortTime } from "@/lib/text";

/**
 * The attendee's own seats in one activity: what they hold, any request waiting on the desk,
 * and the cancel control. Asking to switch moved to the sheet's time grid - picking another
 * time there is the switch - so this no longer carries a session dropdown.
 *
 * Separated from the session rows deliberately: the control that undoes your afternoon used
 * to sit in the same column, in the same shape, as the control that booked it. Here there is
 * one statement of what you hold and one place to change it.
 *
 * One block per held seat. `max_per_attendee` runs to 10, and an earlier version bound both
 * request controls to the first held seat only, so a second seat was stranded — its row said
 * "You are booked" and offered nothing anywhere on the page. The pending and declined states
 * stay per-activity, not per-seat, because D146's index allows only one open request per
 * attendee per activity: while one is open, no seat offers controls.
 */
export function ActivityBooking({ controls, pendingId, calendarPath, change, requestCancel, withdraw, arrivals }: {
  controls: ActivityControls;
  /**
   * With a single seat, the page's big button is Add to calendar, so the seat's line carries
   * the other action instead: Change session (the dialog as a link), or nothing when there is
   * nowhere to move to. Undefined keeps Add to calendar on every line, for several seats.
   */
  change?: React.ReactNode;
  // The raw pending request's id: `controls.pending` (a `PendingSummary`) deliberately carries
  // no id — it is for rendering, not addressing — so the id travels alongside it. Bound here,
  // not by the caller, so a caller whose `pendingId` ever drifts from `controls.pending` gets a
  // form with no action (a harmless no-op reload) instead of a crash at render.
  pendingId: string | null;
  /** The activity's calendar.ics route; each held seat links to it with `?session=`. */
  calendarPath: string;
  requestCancel: (fromSessionId: string) => Promise<void>;
  withdraw: (requestId: string) => Promise<void>;
  /** D333: this session's arrival, by session id, when the attendee was checked in at a door for it. */
  arrivals: Record<string, string>;
}) {
  const { held, pending, declined, switchTargets, canRequestCancel } = controls;
  const allIn = held.length > 0 && held.every((s) => arrivals[s.session.id]);
  if (held.length === 0 && !pending && !declined) return null;

  if (pending) {
    return (
      <div className="rounded-[12px] bg-accent p-3 text-sm">
        <p className="font-bold text-accent-foreground">
          {pending.kind === "cancel"
            ? `Waiting for approval: cancel ${pending.fromLabel ?? "your session"}`
            : `Waiting for approval: move to ${pending.toLabel ?? "another session"}`}
        </p>
        <p className="mt-1 text-muted-foreground">
          Your seat is held until the committee agrees, so nothing has changed yet.
        </p>
        <form action={pendingId ? withdraw.bind(null, pendingId) : undefined} className="mt-2">
          <SubmitButton variant="outline">Withdraw request</SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* D153a: an approval needs no announcement — they are simply booked on the session
          they asked for. A decline would otherwise leave no trace at all. */}
      {declined && (
        <p className="text-sm text-warning">
          {declined.kind === "cancel"
            ? `The committee declined your request to cancel ${declined.fromLabel ?? "that session"}.`
            : `The committee declined your request to move to ${declined.toLabel ?? "another session"}.`}
        </p>
      )}
      {held.map((seat) => {
        const arrivedAt = arrivals[seat.session.id];
        return (
          <div key={seat.session.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[10px] bg-success-soft px-3 py-2 text-sm text-success-strong">
            <span className="flex items-center gap-1.5 font-bold">
              <Icon name="check" size={16} />
              {arrivedAt ? `Checked in at ${shortTime(arrivedAt)} · ${sessionLabel(seat.session)}` : <>You&apos;re booked {sessionLabel(seat.session)}</>}
            </span>
            {/* D336: a checked-in session is finished - no calendar link, no change, no cancel. */}
            <span className="flex items-center gap-4">
              {arrivedAt ? null : change !== undefined ? change : (
                <AddToCalendar href={`${calendarPath}?session=${seat.session.id}`} className="flex items-center gap-1 underline">
                  <Icon name="calendar" size={16} />
                  Add to calendar
                </AddToCalendar>
              )}
              {!arrivedAt && canRequestCancel && (
                <form action={requestCancel.bind(null, seat.session.id)}>
                  <ConfirmButton
                    tone="default"
                    triggerVariant="link"
                    className="h-auto p-0 text-success-strong underline"
                    confirmLabel="Send request"
                    message={`Ask the committee to cancel ${sessionLabel(seat.session)}? Your seat is held until they agree.`}
                  >
                    Ask to cancel
                  </ConfirmButton>
                </form>
              )}
            </span>
          </div>
        );
      })}
      {/* Moving is done from the grid in the page's dialog: pick another time and its bar
          offers the switch. Hidden once every held seat is checked in (D336): there is nowhere
          left to move to that means anything. */}
      {held.length > 0 && !allIn && (
        <p className="text-xs text-muted-foreground">
          {switchTargets.length > 0 ? "To move, tap Change session and pick another time. The committee approves it." : "No other session has room right now."}
        </p>
      )}
    </div>
  );
}
