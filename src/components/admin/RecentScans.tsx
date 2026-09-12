import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import type { ScanRow } from "@/lib/checkins-stats";
import { isoToLocalInput } from "@/lib/time";
import { elapsed } from "@/lib/text";

const hhmm = (iso: string) => isoToLocalInput(iso).split("T")[1] ?? "";

export function RecentScans({ rows, checkpointNames, live }: { rows: ScanRow[]; checkpointNames: Map<string, string>; live?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent scans</CardTitle>
        {live && <CardAction>{live}</CardAction>}
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <Empty className="border-0 bg-transparent">
            <EmptyHeader>
              <EmptyTitle>No scans yet</EmptyTitle>
              <EmptyDescription>They appear here as the crew works the door.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Attendee</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Checkpoint</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.checkinId}>
                  <TableCell className="font-semibold">{r.name}</TableCell>
                  <TableCell>
                    {r.tableNo ? <Badge variant="secondary">{r.tableNo}</Badge> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{checkpointNames.get(r.checkpointId) ?? "—"}</TableCell>
                  {/* Absolute time answers "when"; the elapsed line is what says the door is still moving. */}
                  <TableCell>
                    <div className="font-semibold tabular-nums">{hhmm(r.at)}</div>
                    <div className="text-xs text-muted-foreground">{elapsed(r.at)}</div>
                  </TableCell>
                  <TableCell>
                    {r.duplicate
                      ? <Badge variant="warning">Already in</Badge>
                      : <Badge variant="success">Checked in</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
