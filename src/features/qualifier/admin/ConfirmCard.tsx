import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { shortDateTime } from "@/lib/text";
import { FINALISTS } from "../scoring";

export type FinaleEntry = { rank: number; attendeeId: string; label: string; name: string; score: number; flagged: boolean };

const needReview = (n: number) =>
  n === 0 ? "None flagged — open each finalist's runs before confirming." : `${n} of the top 10 ${n === 1 ? "needs" : "need"} review.`;

function List({ entries }: { entries: FinaleEntry[] }) {
  return (
    <ol className="divide-y divide-border rounded-lg border border-border">
      {entries.map((e) => (
        <li key={e.attendeeId} className="flex items-center gap-3 px-3 py-2 text-sm">
          <span className="w-6 font-bold tabular-nums">{e.rank}</span>
          <span className="min-w-0 flex-1 truncate">
            <span className="font-bold">{e.label}</span>
            {e.label !== e.name && <span className="ml-2 text-xs text-muted-foreground">{e.name}</span>}
          </span>
          {e.flagged && <Badge variant="warning">Review</Badge>}
          <span className="font-bold tabular-nums">{e.score}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The finale list (D775, D795). Not confirmed: the current top 10 with how many of them are
 * flagged, and Confirm finalists behind a confirmation. While runs started before the close are
 * still being played (`liveRuns`, each can still change the board) the button stays disabled
 * and says how many. Confirmed: the frozen list and when it was locked. The page draws it in the
 * review and confirmed phases only. `action` is the bound confirm.
 */
export function ConfirmCard({ confirmedAt, entries, liveRuns, action }: {
  /** Set once confirmed; the entries are then the finalists, otherwise the live top 10. */
  confirmedAt: string | null;
  entries: FinaleEntry[];
  liveRuns: number;
  action: () => Promise<void>;
}) {
  if (confirmedAt) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Finale list</CardTitle>
          <CardDescription>Confirmed {shortDateTime(confirmedAt)}. The board and the settings are locked.</CardDescription>
        </CardHeader>
        <CardContent><List entries={entries} /></CardContent>
      </Card>
    );
  }
  const flagged = entries.filter((e) => e.flagged).length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirm finalists</CardTitle>
        <CardDescription>
          The qualifier is closed. {entries.length > 0 ? needReview(flagged) : "No one is on the board yet."} Check any
          flagged run, disqualify what doesn&apos;t belong, then lock the top {FINALISTS}.
        </CardDescription>
      </CardHeader>
      {entries.length > 0 && (
        <CardContent className="flex flex-col gap-4">
          <List entries={entries} />
          {liveRuns > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled>Confirm finalists</Button>
              <p role="status" className="text-sm text-muted-foreground">
                {liveRuns} {liveRuns === 1 ? "run" : "runs"} still being played. Reload when {liveRuns === 1 ? "it ends" : "they end"}.
              </p>
            </div>
          ) : (
            <form action={action}>
              <ConfirmButton tone="default" triggerVariant="default" confirmLabel="Confirm finalists"
                message="Lock the top 10 as the finale list? The board and settings can't change after this.">
                Confirm finalists
              </ConfirmButton>
            </form>
          )}
        </CardContent>
      )}
    </Card>
  );
}
