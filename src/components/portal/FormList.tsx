import Link from "next/link";
import type { Form } from "@/lib/types";
import type { SubmitState } from "@/lib/forms";
import { capSummary } from "@/lib/forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

type FormEntry = { form: Form; state: SubmitState };

/**
 * One card per form this attendee's category may see. A form they are `ineligible` for never
 * appears here — the same rule `ActivityList` applies with `state.eligible` — but every other
 * state (closed, at their cap, already sent today) still shows, because "come back tomorrow" is
 * a useful thing to read on the list, not just after tapping in.
 */
export function FormList({ entries, basePath }: {
  entries: FormEntry[];
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
          <CardHeader className="flex flex-row items-baseline justify-between gap-3">
            <CardTitle className="text-[15px] font-bold">{form.name}</CardTitle>
            <Badge variant="secondary">{capSummary(form)}</Badge>
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
