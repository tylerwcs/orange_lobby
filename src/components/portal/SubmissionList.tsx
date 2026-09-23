import Link from "next/link";
import type { Activity } from "@/lib/types";
import type { SubmitState } from "@/lib/submissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

type SubmissionEntry = { form: Activity; state: SubmitState };

/**
 * One card per submission activity this attendee's category may see. One they are `ineligible`
 * for never appears here — the same rule `ActivityList` applies with `state.eligible` — but
 * every other state (closed, at their cap, already sent today) still shows, because "come back
 * tomorrow" is a useful thing to read on the list, not just after tapping in.
 *
 * Was `FormList`, back when forms had their own table (D178).
 */
export function SubmissionList({ entries, basePath }: {
  entries: SubmissionEntry[];
  basePath: string;
}) {
  const open = entries.filter((e) => e.state.reason !== "ineligible");
  if (open.length === 0) {
    return <p className="text-sm text-muted-foreground">There is nothing to fill in for this event.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {open.map(({ form, state }) => (
        <Card key={form.id}>
          {/* No cap badge here. "Once" or "Unlimited" is the organiser's policy, and an
              attendee learns it from what the page lets them do — the button says Fill in or
              it does not, and the refusal names the reason. A pill restating the rule was
              furniture on a card whose whole job is one decision. The admin list keeps it,
              because that IS the screen where the policy is being set. */}
          <CardHeader>
            <CardTitle className="text-[15px] font-bold">{form.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {form.description && <p className="text-sm text-muted-foreground">{form.description}</p>}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground tabular-nums">
                {state.used} submission{state.used === 1 ? "" : "s"} sent
              </span>
              <Link href={`${basePath}/${form.id}`} className={buttonVariants({ variant: state.can ? "default" : "outline", size: "sm" })}>
                {state.can ? "Fill in" : "View"}
              </Link>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
