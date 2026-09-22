import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { meterAriaMax, meterAriaValue, meterPercent } from "@/lib/meter";
import type { ActivitySummary } from "@/lib/activities";

/**
 * What the Overview shows an event with no door (D159).
 *
 * The question an arrivals dashboard answers — "is the room filling up?" — has no meaning
 * here. The one that replaces it is "are people booking the things we laid on?", so the
 * three figures across the top are the booking equivalents of the three it replaces:
 * seats taken stands in for checked in, seats left for not yet in, and registered stays
 * exactly where it was, because the roster is the roster either way.
 *
 * Every number arrives already computed by `activitySummaries`; this file adds nothing up
 * beyond totalling the rows it was handed.
 */
export function ActivityOverview({ rows, registered, basePath }: {
  rows: ActivitySummary[];
  registered: number;
  basePath: string;
}) {
  const capacity = rows.reduce((n, r) => n + r.capacity, 0);
  const booked = rows.reduce((n, r) => n + r.booked, 0);
  const left = rows.reduce((n, r) => n + r.left, 0);
  const pct = Math.round(meterPercent(booked, capacity));

  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Nothing to book yet</EmptyTitle>
          <EmptyDescription>
            This event has no check-in, so the Overview shows what people are booking instead.
            Add an activity and its sessions, and the numbers appear here.
          </EmptyDescription>
        </EmptyHeader>
        <Link href={`${basePath}/activities`} className="text-sm font-bold text-primary underline-offset-4 hover:underline">
          Go to Activities
        </Link>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Container queries for the same reason OverviewStats uses them: these sit inside
          SidebarInset, so the width is the viewport minus a sidebar the reader can collapse. */}
      <div className="@container">
      <div className="grid gap-4 @xl:grid-cols-2 @3xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Seats taken</CardDescription>
            <CardTitle className="flex items-baseline gap-2">
              <span className="text-4xl font-extrabold leading-none tracking-tight tabular-nums text-success-strong">{booked}</span>
              <span className="text-sm font-normal text-muted-foreground">of {capacity}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Progress
              value={pct}
              className="[&_[data-slot=progress-indicator]]:bg-success-strong"
              aria-label={`${booked} of ${capacity} seats booked across every activity`}
              aria-valuenow={meterAriaValue(booked, capacity)}
              aria-valuemin={0}
              aria-valuemax={meterAriaMax(capacity)}
            />
            <p className="text-xs text-muted-foreground tabular-nums">{pct}% of the seats are spoken for</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Seats left</CardDescription>
            <CardTitle>
              <span className="text-4xl font-extrabold leading-none tracking-tight tabular-nums">{left}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {left === 0 ? "Every session is full." : "Still bookable across every session."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Registered</CardDescription>
            <CardTitle>
              <span className="text-4xl font-extrabold leading-none tracking-tight tabular-nums">{registered}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">On the list for this event.</p>
          </CardContent>
        </Card>
      </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle>Activities</CardTitle>
          <CardDescription>One line each. &ldquo;Waiting&rdquo; is eligible people holding nothing in that activity.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ul>
            {rows.map((r) => (
              <li key={r.activityId} className="border-b border-border last:border-b-0">
                <Link
                  href={`${basePath}/activities/${r.activityId}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-6 py-3 hover:bg-muted/50"
                >
                  <span className="text-sm font-bold">{r.name}</span>
                  {r.required && <Badge variant="secondary">Required</Badge>}
                  <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                    {/* An activity with no sessions reads "no sessions yet" rather than
                        "0 of 0 seats", which looks like a full house at a glance. */}
                    {r.sessions === 0
                      ? "No sessions yet"
                      : `${r.booked} of ${r.capacity} seats · ${r.unbooked} waiting`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
