import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { shortDateTime } from "@/lib/text";
import type { RunRow } from "../db";

/** How long the game lasted, m:ss. */
const duration = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const STATUS: Record<string, string> = { done: "Finished", live: "Not finished", abandoned: "Abandoned" };

/**
 * An attendee's runs, newest first (D775, D795): when it started, its state, the replayed
 * score, how long it lasted, slimes popped, bosses beaten, the fastest 10 s of typing (letters
 * per second × 12, about words per minute) and the device, with a badge for text that arrived
 * as an insert (swipe typing, a keyboard's suggestion). A finished run can be disqualified, or
 * restored once it has been; both are hidden when `locked` (the finalists are confirmed).
 * `actionFor` hands back the already-bound server action for a run, so this stays free of the
 * app folder. A disqualified run's numbers are struck through: it no longer counts.
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
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Score</TableHead>
          <TableHead className="text-right">Duration</TableHead>
          <TableHead className="text-right">Popped</TableHead>
          <TableHead className="text-right">Bosses</TableHead>
          <TableHead className="text-right">Peak</TableHead>
          <TableHead>Device</TableHead>
          <TableHead><span className="sr-only">Inserts</span></TableHead>
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
              <TableCell>
                <span className="flex flex-wrap gap-1">
                  <Badge variant="outline">{STATUS[r.status] ?? r.status}</Badge>
                  {r.flagged && <Badge variant="warning">Review</Badge>}
                  {out && <Badge variant="destructive">Disqualified</Badge>}
                </span>
              </TableCell>
              <TableCell className={`text-right font-bold tabular-nums ${num}`}>{r.score ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{r.ended_ms === null ? "—" : duration(r.ended_ms)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.popped ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{r.bosses ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-nums">{r.peak_cps === null ? "—" : `≈ ${Math.round(r.peak_cps * 12)} wpm`}</TableCell>
              <TableCell className="capitalize">{r.device}</TableCell>
              <TableCell>
                {r.multi_inserts > 0 && <Badge variant="outline">{r.multi_inserts} inserted {r.multi_inserts === 1 ? "letter" : "letters"}</Badge>}
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
