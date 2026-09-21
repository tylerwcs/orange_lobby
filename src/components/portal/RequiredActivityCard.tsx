import Link from "next/link";
import type { ActivityState } from "@/lib/activities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const caption = "text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground";

/**
 * The activities this attendee still has to choose, on the page they land on.
 *
 * Renders nothing when there is nothing to pick, so every event that runs no activities —
 * which is all of them today — sees no change. Mirrors BreakoutCard, which solves the same
 * problem from the other direction: that card says where you have been put, this one says
 * where you have not yet chosen.
 */
export function RequiredActivityCard({ states, basePath }: { states: ActivityState[]; basePath: string }) {
  if (states.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle className={caption}>Still to choose</CardTitle></CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {states.map((s) => {
            const left = s.sessions.reduce((n, x) => n + x.left, 0);
            return (
              <li key={s.activity.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 py-2.5">
                <span className="font-medium">{s.activity.name}</span>
                <span className="ml-auto text-muted-foreground">
                  {s.closed
                    ? "Booking closed — see the desk"
                    : <Link className="font-medium text-primary" href={`${basePath}/activities`}>{left} seats left</Link>}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
