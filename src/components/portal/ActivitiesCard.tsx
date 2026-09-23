import Link from "next/link";
import type { ActivityState } from "@/lib/activities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const caption = "text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground";

/**
 * Every activity this attendee is eligible for, on the page they land on: what they still
 * have to choose, and what they already hold or could still book — each a link back to
 * `${basePath}/activities`, because that page has no other route in from the nav (D132 keeps
 * it off the anonymous portal, and a tile for it is optional per-event configuration). Without
 * this, an attendee who has already booked has no way back to ask for a switch (D129, as
 * revised, promises them the freedom to ask), and an optional activity they have not touched
 * yet is unreachable from the start.
 *
 * Was `RequiredActivityCard`, which only ever rendered the "still to choose" list. Renamed
 * because it now also carries what the attendee already holds and any optional activity still
 * open to them.
 *
 * Required-and-unpicked leads, because that is the one a nag is for, AND carries the same
 * "Pick one" badge `ActivityList` puts on it there — sort order alone is too quiet a signal
 * that a choice is owed, and the two surfaces have to agree on what "owed" looks like.
 * Everything else follows as a plain way back to the page rather than a demand. Renders
 * nothing when there is nothing to show, so every event that runs no activities - or none this
 * attendee's category can see - sees no change. Mirrors BreakoutCard, which solves the same
 * problem from the other direction: that card says where you have been put, this one is the
 * way back to where you choose.
 */
export function ActivitiesCard({ states, basePath }: { states: ActivityState[]; basePath: string }) {
  const eligible = states.filter((s) => s.eligible);
  if (eligible.length === 0) return null;
  const mustPick = eligible.filter((s) => s.mustPick);
  const rest = eligible.filter((s) => !s.mustPick);

  const status = (s: ActivityState) => {
    // Held first, even over closed: an optional activity that closed after this attendee
    // booked still owes them a way back to see what they hold, and to ask the desk to change
    // it (D157 — asking is not taking a seat, so it is not gated on is_open the way
    // booking a new one is).
    if (s.held > 0) {
      return <Link className="font-medium text-primary" href={`${basePath}/activities`}>Booked — see sessions</Link>;
    }
    if (s.closed) return "Booking closed — see the desk";
    const left = s.sessions.reduce((n, x) => n + x.left, 0);
    return <Link className="font-medium text-primary" href={`${basePath}/activities`}>{left} seats left</Link>;
  };

  return (
    <Card>
      <CardHeader><CardTitle className={caption}>Activities</CardTitle></CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {[...mustPick, ...rest].map((s) => (
            <li key={s.activity.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2.5">
              <span className="flex items-center gap-2 font-medium">
                {s.activity.name}
                {/* Matches ActivityList's own "Pick one" badge (D129): the two places an
                    attendee sees this activity must not disagree about whether it is owed. */}
                {s.mustPick && <Badge variant="secondary">Pick one</Badge>}
              </span>
              <span className="ml-auto text-muted-foreground">{status(s)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
