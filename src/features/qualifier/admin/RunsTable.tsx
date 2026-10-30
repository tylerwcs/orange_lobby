import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { shortDateTime } from "@/lib/text";
import type { RunRow } from "../db";

/**
 * An attendee's runs, newest first (D775). A finished run can be disqualified, or restored
 * once it has been; both are hidden when `locked` (the finalists are confirmed). `actionFor`
 * hands back the already-bound server action for a run, so this stays free of the app folder.
 * A disqualified run's numbers are struck through: it no longer counts.
 */
export function RunsTable({ runs, locked, actionFor }: {
  runs: RunRow[];
  locked: boolean;
  actionFor: (run: RunRow) => () => Promise<void>;
}) {
  if (runs.length === 0) return <p className="p-6 text-sm text-muted-foreground">No runs yet.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Started</TableHead>
          <TableHead className="text-right">Wpm</TableHead>
          <TableHead className="text-right">Accuracy</TableHead>
          <TableHead className="text-right">Words</TableHead>
          <TableHead>Device</TableHead>
          <TableHead>Notes</TableHead>
          <TableHead className="w-32"><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((r) => {
          const out = r.disqualified_at !== null;
          const num = out ? "line-through text-muted-foreground" : "";
          return (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap">{shortDateTime(r.starts_at)}</TableCell>
              <TableCell className={`text-right font-bold tabular-nums ${num}`}>{r.wpm ?? "—"}</TableCell>
              <TableCell className={`text-right tabular-nums ${num}`}>{r.accuracy === null ? "—" : `${r.accuracy}%`}</TableCell>
              <TableCell className="text-right tabular-nums">{r.words_done ?? "—"}</TableCell>
              <TableCell className="capitalize">{r.device}</TableCell>
              <TableCell>
                <span className="flex flex-wrap gap-1">
                  {r.status !== "done" && <Badge variant="outline">{r.status === "live" ? "Not finished" : "Abandoned"}</Badge>}
                  {r.flagged && <Badge variant="warning">Review</Badge>}
                  {r.multi_inserts > 0 && <Badge variant="outline">{r.multi_inserts} multi-letter {r.multi_inserts === 1 ? "input" : "inputs"}</Badge>}
                  {out && <Badge variant="destructive">Disqualified</Badge>}
                </span>
              </TableCell>
              <TableCell className="text-right">
                {!locked && r.status === "done" && (
                  <form action={actionFor(r)}>
                    {out
                      ? <ConfirmButton tone="default" confirmLabel="Restore" message="Restore this run? It counts again, and the board is recomputed.">Restore</ConfirmButton>
                      : <ConfirmButton confirmLabel="Disqualify" message="Disqualify this run? It stops counting and the board is recomputed. You can restore it until the finalists are confirmed.">Disqualify</ConfirmButton>}
                  </form>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
