import type { ActivityState } from "@/lib/activities";
import { canCancel } from "@/lib/activities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/admin/SubmitButton";

export function ActivityList({ states, book, switchTo, cancel }: {
  states: ActivityState[];
  book: (sessionId: string) => Promise<void>;
  switchTo: (fromSessionId: string, toSessionId: string) => Promise<void>;
  cancel: (sessionId: string) => Promise<void>;
}) {
  const open = states.filter((s) => s.eligible);
  if (open.length === 0) {
    return <p className="text-sm text-muted-foreground">There is nothing to book for this event.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {open.map((state) => (
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
            {/*
              The one booking a "switch here" button would move. Offered only when the
              attendee holds exactly one session of this activity: with two, "switch" does
              not say which one is moving (D129), and the honest control is to cancel the
              one they mean — which the cap being full already allows, since held > 1 passes
              canCancel even on a required activity.
            */}
            {state.sessions.map(({ session, left, full, mine }, _i, all) => {
              const heldOne = state.held === 1 ? all.find((s) => s.mine)?.session.id ?? null : null;
              return (
              <div key={session.id} className="flex items-center gap-3 border-t border-border pt-2.5 first:border-t-0 first:pt-0">
                <div className="w-11 shrink-0 text-[13px] text-muted-foreground tabular-nums">
                  {session.starts_at}
                  {session.ends_at && <div className="text-[11px]">{session.ends_at}</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold">{session.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {session.location ? `${session.location} · ` : ""}
                    {mine ? "You are booked" : full ? "No seats left" : `${left} left`}
                  </div>
                </div>
                {/* SubmitButton takes only children, className and variant — it has no size
                    or pendingLabel prop, and says "Working…" while pending on its own. */}
                {mine ? (
                  canCancel(state.activity, state.held) ? (
                    <form action={cancel.bind(null, session.id)}>
                      <SubmitButton variant="outline">Cancel</SubmitButton>
                    </form>
                  ) : null
                ) : full ? (
                  <span className="rounded-[10px] bg-muted px-3 py-1.5 text-xs text-muted-foreground">Full</span>
                ) : state.canBookMore ? (
                  <form action={book.bind(null, session.id)}>
                    <SubmitButton>Book</SubmitButton>
                  </form>
                ) : heldOne && !state.closed ? (
                  <form action={switchTo.bind(null, heldOne, session.id)}>
                    <SubmitButton variant="outline">Switch here</SubmitButton>
                  </form>
                ) : null}
              </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
