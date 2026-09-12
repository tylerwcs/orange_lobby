import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { meterAriaMax, meterAriaValue, meterPercent } from "@/lib/meter";

/**
 * The three numbers an organiser is actually asking the Overview for, across the top of
 * the page rather than stacked in a side rail. "Is this event on track?" should be
 * answered before anything else is read.
 *
 * The checkpoint is not named on the cards. The picker in the page header sits directly
 * above them and says it once; it still reaches the progress bar's label, which is where
 * a screen reader needs it.
 */
export function OverviewStats({ checkedIn, registered, scope }: {
  checkedIn: number;
  registered: number;
  /** The running checkpoint, or null when the event has none yet. */
  scope: string | null;
}) {
  const notYet = Math.max(0, registered - checkedIn);
  const pct = Math.round(meterPercent(checkedIn, registered));

  // Container queries, not viewport ones: these sit inside SidebarInset, so the space they
  // actually get is the viewport minus a sidebar the reader can collapse. The @container
  // must be a PARENT of whatever reads it - an element does not query itself.
  return (
    <div className="@container">
    <div className="grid gap-4 @xl:grid-cols-2 @3xl:grid-cols-3">
      <Card>
        <CardHeader>
          <CardDescription>Checked in</CardDescription>
          <CardTitle className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold leading-none tracking-tight tabular-nums text-success-strong">{checkedIn}</span>
            <span className="text-sm font-normal text-muted-foreground">of {registered}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Progress
            value={pct}
            /* Green, to agree with the figure above it. Stock fills with --primary, which
               put an orange bar under a green number. */
            className="[&_[data-slot=progress-indicator]]:bg-success-strong"
            aria-label={`${checkedIn} of ${registered} attendees checked in${scope ? ` at ${scope}` : ""}`}
            aria-valuenow={meterAriaValue(checkedIn, registered)}
            aria-valuemin={0}
            aria-valuemax={meterAriaMax(registered)}
          />
          <p className="text-xs text-muted-foreground tabular-nums">{pct}% of the room is in</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>Not yet in</CardDescription>
          <CardTitle>
            <span className="text-4xl font-extrabold leading-none tracking-tight tabular-nums">{notYet}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            {notYet === 0 ? "Everyone registered has arrived." : "Expected but not scanned at this checkpoint."}
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
          <p className="text-xs text-muted-foreground">On the list, across every checkpoint.</p>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
