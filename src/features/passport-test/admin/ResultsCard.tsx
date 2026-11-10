import type { Activity, Event } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RowActions } from "@/components/admin/RowActions";
import { DangerButton } from "@/components/admin/DangerButton";
import { countByPersonality } from "../lib/results";
import { readPassportTest } from "../lib/settings";
import type { PassportResult } from "../lib/score";
import { clearAllResultsAction, clearResultAction } from "./actions";

const when = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * D888: who got which personality. A count per personality, then each guest with their
 * personality, the name they put on the passport and when; ⋯ Clear result lets one guest take the
 * test again (D882). Clear all is the way out of the locks (D887). Shown once the test is on or
 * anyone has a result.
 */
export function ResultsCard({ ev, activity, results, names }: {
  ev: Event;
  activity: Activity;
  results: PassportResult[];
  /** Attendee id → their registered name. */
  names: Record<string, string>;
}) {
  const test = readPassportTest(activity.passport_test);
  if (!test.on && results.length === 0) return null;
  const counts = countByPersonality(results, test.personalities);
  const nameOf = new Map(test.personalities.map((p) => [p.id, p.name]));
  const rows = [...results].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>Test results</CardTitle>
          <CardDescription className="tabular-nums">
            {results.length} {results.length === 1 ? "guest has" : "guests have"} taken this test
            {counts.length > 0 && <> · {counts.map((c) => `${c.name} ${c.count}`).join(" · ")}</>}
          </CardDescription>
        </div>
        {results.length > 0 && (
          <DangerButton size="sm" action={clearAllResultsAction.bind(null, ev.id, activity.id)}
            message={`All ${results.length} results are cleared and every guest takes the test again. Their stamps stay. This cannot be undone.`}>
            Clear all results
          </DangerButton>
        )}
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0
          ? <p className="px-4 text-sm text-muted-foreground">Nobody has taken it yet.</p>
          : (
            <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto px-4">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{names[r.attendee_id] ?? "Someone no longer registered"}</div>
                    <div className="truncate text-xs font-semibold text-muted-foreground">
                      {nameOf.get(r.personality_id) ?? "Other"} · on the passport as “{r.holder_name}”
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{when.format(new Date(r.created_at))}</span>
                  <RowActions
                    name={names[r.attendee_id] ?? "this guest"}
                    remove={{ action: clearResultAction.bind(null, ev.id, activity.id, r.attendee_id), label: "Clear result", message: "They can take the test again. Their stamps stay." }}
                  />
                </li>
              ))}
            </ul>
          )}
      </CardContent>
    </Card>
  );
}
