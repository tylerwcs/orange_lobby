import type { ActivityState } from "@/lib/activities";
import type { ActivityControls } from "@/lib/activity-requests";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { ActivityBooking } from "@/components/portal/ActivityBooking";
import { shortDate } from "@/lib/text";

type ActivityEntry = { state: ActivityState; controls: ActivityControls; pendingId: string | null };

export function ActivityList({ entries, book, requestSwitch, requestCancel, withdraw }: {
  entries: ActivityEntry[];
  book: (sessionId: string) => Promise<void>;
  requestSwitch: (fromSessionId: string, fd: FormData) => Promise<void>;
  requestCancel: (fromSessionId: string) => Promise<void>;
  withdraw: (requestId: string) => Promise<void>;
}) {
  const open = entries.filter((e) => e.state.eligible);
  if (open.length === 0) {
    return <p className="text-sm text-muted-foreground">There is nothing to book for this event.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {open.map(({ state, controls, pendingId }) => {
        const bookableIds = new Set(controls.bookable.map((s) => s.session.id));
        return (
          <Card key={state.activity.id}>
            <CardHeader className="flex flex-row items-baseline justify-between gap-3">
              <CardTitle className="text-[15px] font-bold">{state.activity.name}</CardTitle>
              {state.mustPick
                ? <Badge variant="secondary">Pick one</Badge>
                : state.held > 0 ? <Badge>Booked</Badge> : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              {state.activity.description && (
                <p className="text-sm text-muted-foreground">{state.activity.description}</p>
              )}
              {state.closed && (
                <p className="text-sm text-muted-foreground">Booking is closed for this activity.</p>
              )}
              {state.sessions.map(({ session, left, full, mine }) => (
                <div key={session.id} className="flex items-center gap-3 border-t border-border pt-2.5 first:border-t-0 first:pt-0">
                  <div className="w-11 shrink-0 text-[13px] text-muted-foreground tabular-nums">
                    {session.starts_at}
                    {session.ends_at && <div className="text-[11px]">{session.ends_at}</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[15px] font-bold">{session.title}</span>
                      {!mine && !full && (
                        <span className={`text-sm font-bold tabular-nums ${left <= 3 ? "text-warning" : "text-muted-foreground"}`}>
                          {left} left
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {mine ? "You are booked" : session.location}
                    </div>
                  </div>
                  {mine ? null : full ? (
                    <span className="rounded-[10px] bg-muted px-3 py-1.5 text-xs text-muted-foreground">Full</span>
                  ) : bookableIds.has(session.id) ? (
                    <form action={book.bind(null, session.id)}>
                      <ConfirmButton
                        tone="default"
                        triggerVariant="default"
                        confirmLabel="Book"
                        message={`Book ${session.title}, ${shortDate(session.day)}, ${session.starts_at}${session.ends_at ? `–${session.ends_at}` : ""}${session.location ? `, ${session.location}` : ""}?`}
                      >
                        Book
                      </ConfirmButton>
                    </form>
                  ) : (
                    // Not mine, not full, yet absent from `controls.bookable`: either this
                    // attendee is already at the per-activity cap (e.g. a required activity
                    // with one session already held), the activity is closed, or a change
                    // request is open for it — Book is withheld in all three cases.
                    null
                  )}
                </div>
              ))}
              <ActivityBooking
                controls={controls}
                requestSwitch={requestSwitch}
                requestCancel={requestCancel}
                withdraw={pendingId ? withdraw.bind(null, pendingId) : async () => {}}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
