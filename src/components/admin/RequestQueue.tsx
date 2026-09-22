import type { ActivityChangeRequest } from "@/lib/types";
import { elapsed, shortDateTime } from "@/lib/text";
import { shortScanner } from "@/lib/db/users";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** "Morning → Afternoon" for a switch, "Cancel Afternoon" for a cancel. */
function describe(request: Pick<ActivityChangeRequest, "kind">, fromTitle: string, toTitle: string | null): string {
  return request.kind === "cancel" ? `Cancel ${fromTitle}` : `${fromTitle} → ${toTitle ?? "another session"}`;
}

/**
 * The desk's own queue: what attendees have asked to change on this activity, waiting for a
 * decision.
 *
 * Approve and Decline are both bound server actions that write through `decideRequest`
 * (`decide_request` in 0021_decide_request.sql — one atomic call, so a concurrent approve and
 * decline on the same request can no longer disagree with each other, D154) — this component
 * only renders the choice and never moves a booking or stamps a decision itself.
 *
 * Renders nothing at all when there is neither a pending nor a decided request, so an activity
 * nobody has asked anything about looks exactly as it does today. Decided requests sit behind
 * a native `<details>` disclosure rather than on screen by default — the desk is working the
 * queue, not reading the log — which needs no client-side state, so this stays a server
 * component like the card that renders it.
 */
export function RequestQueue({
  pending, decided, sessionTitle, attendeeName, deciderEmails, approve, decline,
}: {
  /** Oldest first — `listRequests` already orders by `created_at`. */
  pending: ActivityChangeRequest[];
  decided: ActivityChangeRequest[];
  sessionTitle: (sessionId: string) => string;
  attendeeName: (attendeeId: string) => string;
  /** `decided_by` resolved to an email via `scannerNames`; absent ids (withdrawals, unresolved) are simply missing. */
  deciderEmails: Record<string, string>;
  approve: (requestId: string) => Promise<void>;
  decline: (requestId: string) => Promise<void>;
}) {
  if (pending.length === 0 && decided.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b"><CardTitle>Requests · {pending.length} pending</CardTitle></CardHeader>
      <CardContent className="px-6 py-4">
        {pending.length > 0 && (
          <ul className="divide-y divide-border">
            {pending.map((r) => {
              const name = attendeeName(r.attendee_id);
              const what = describe(r, sessionTitle(r.from_session_id), r.to_session_id ? sessionTitle(r.to_session_id) : null);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{name}</div>
                    <div className="text-xs font-semibold text-muted-foreground">{what} · {elapsed(r.created_at)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* `.bind`, not `() => approve(r.id)`: this is a server component, and a
                        plain closure is not a server reference — React's Flight serializer
                        refuses to pass it to the client form and the whole activity page 500s
                        the moment one request exists. `approve`/`decline` arrive already bound
                        once (to event and activity) from the page; binding the request id on
                        top of a server reference yields another server reference. */}
                    <form action={approve.bind(null, r.id)}>
                      {/* Approve is the one with no undo: it moves a real seat, and the desk
                          cannot raise a request on somebody's behalf to put it back (a
                          re-placement hits `'limit'` at a cap of one). Decline touches
                          nothing, and is confirmed only because it closes the request. */}
                      <ConfirmButton
                        tone="default"
                        triggerVariant="default"
                        confirmLabel="Approve"
                        message={`Approve ${name}'s request — ${what}? Their seat moves now, and you cannot undo it from here.`}
                      >
                        Approve
                      </ConfirmButton>
                    </form>
                    <form action={decline.bind(null, r.id)}>
                      <ConfirmButton message={`Decline ${name}'s request — ${what}?`}>
                        Decline
                      </ConfirmButton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {decided.length > 0 && (
          <details className={pending.length > 0 ? "mt-4" : undefined}>
            <summary className="cursor-pointer text-sm font-bold text-muted-foreground">Show decided</summary>
            <ul className="mt-2 divide-y divide-border">
              {decided.map((r) => {
                const name = attendeeName(r.attendee_id);
                const what = describe(r, sessionTitle(r.from_session_id), r.to_session_id ? sessionTitle(r.to_session_id) : null);
                const decider = r.decided_by ? deciderEmails[r.decided_by] : undefined;
                return (
                  <li key={r.id} className="py-2.5 text-sm">
                    <span className="font-bold">{name}</span>{" "}
                    <span className="text-muted-foreground">
                      {what} · {r.status}
                      {r.decided_at ? ` · ${shortDateTime(r.decided_at)}` : ""}
                      {decider ? ` · by ${shortScanner(decider)}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
