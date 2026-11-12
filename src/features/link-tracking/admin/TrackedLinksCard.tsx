import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { shortDateTime } from "@/lib/text";
import type { SourceCount } from "../db";
import { LinkBuilder } from "./LinkBuilder";

/**
 * D899: Settings → Event. Make a partner their own registration link, and see what each tag
 * brought: visits to the form, and new people who sent it.
 */
export function TrackedLinksCard({ url, counts }: { url: string; counts: SourceCount[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tracked links</CardTitle>
        <CardDescription>
          A registration link of their own for a partner, a post or a poster, to see how many people it brings.
          The counts are anonymous: one visit for each browser tab that opens the form through the link, and one
          registration for each new person who sends it (waiting list and awaiting approval included).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <LinkBuilder url={url} />
        {counts.length === 0 ? (
          <p className="border-t pt-4 text-sm text-muted-foreground">No visits through a tracked link yet.</p>
        ) : (
          <div className="-mx-(--card-spacing) border-t [&_td:first-child]:pl-(--card-spacing) [&_td:last-child]:pr-(--card-spacing) [&_th:first-child]:pl-(--card-spacing) [&_th:last-child]:pr-(--card-spacing)">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Tag</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Registrations</TableHead>
                  <TableHead className="text-right">Last</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {counts.map((c) => (
                  <TableRow key={c.source}>
                    <TableCell className="font-mono text-xs font-semibold">{c.source}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.visits}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.registrations}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{shortDateTime(c.lastAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
