import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BoardRow } from "../db";
import { FINALISTS } from "../scoring";

/** Rows to a page of the admin board (D775). */
export const BOARD_PAGE_SIZE = 50;

/**
 * One page of the ranked list for the admin (D775): rank, name (a link to that person's
 * runs), best wpm, accuracy, runs played, the best run's device, and a Review badge when the
 * best run is flagged. A cut line is drawn under #10, the finale. `labels` is the name each
 * person goes by (`tagsFor`); the full name sits under it when it differs. Paging is by
 * `?page=`, so this draws only the page it was given.
 */
export function BoardTable({ eventId, rows, labels, page, total }: {
  eventId: string;
  rows: BoardRow[];
  labels: Map<string, string>;
  page: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / BOARD_PAGE_SIZE));
  const base = `/admin/events/${eventId}/qualifier`;
  if (rows.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">No one is on the board yet.</p>;
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">Rank</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Best wpm</TableHead>
            <TableHead className="text-right">Accuracy</TableHead>
            <TableHead className="text-right">Runs</TableHead>
            <TableHead>Device</TableHead>
            <TableHead className="w-24"><span className="sr-only">Review</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.flatMap((r) => {
            const label = labels.get(r.attendee_id) ?? r.name;
            const line = (
              <TableRow key={r.attendee_id}>
                <TableCell className="font-bold tabular-nums">{r.rank}</TableCell>
                <TableCell>
                  <Link href={`${base}/${r.attendee_id}`} className="font-bold text-primary hover:underline">{label}</Link>
                  {label !== r.name && <span className="block text-xs text-muted-foreground">{r.name}</span>}
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums">{r.best_wpm}</TableCell>
                <TableCell className="text-right tabular-nums">{r.best_accuracy}%</TableCell>
                <TableCell className="text-right tabular-nums">{r.runs_played}</TableCell>
                <TableCell className="capitalize">{r.device}</TableCell>
                <TableCell>{r.flagged && <Badge variant="warning">Review</Badge>}</TableCell>
              </TableRow>
            );
            if (r.rank !== FINALISTS) return [line];
            return [
              line,
              <TableRow key={`cut-${r.rank}`} className="hover:bg-transparent">
                <TableCell colSpan={7} className="border-t-2 border-dashed border-primary/50 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-primary">
                  Finale cut line
                </TableCell>
              </TableRow>,
            ];
          })}
        </TableBody>
      </Table>
      {pages > 1 && (
        <nav aria-label="Board pages" className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
          <span className="text-muted-foreground">Page {page} of {pages}</span>
          <span className="flex gap-2">
            {page > 1 && <Link href={`${base}?page=${page - 1}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Previous</Link>}
            {page < pages && <Link href={`${base}?page=${page + 1}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Next</Link>}
          </span>
        </nav>
      )}
    </>
  );
}
