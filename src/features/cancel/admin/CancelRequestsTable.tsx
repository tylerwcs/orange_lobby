import type { Attendee } from "@/lib/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { klDayTime } from "../lib/rules";
import { approveCancelRequestAction, declineCancelRequestAction } from "./actions";

/**
 * D598: the cancellation requests waiting on an organiser, oldest first. Approve and Decline
 * are plain server forms, so they work before the page has hydrated. Admins and committee alike.
 * An archived event is read-only: the rows show, the buttons do not.
 */
export function CancelRequestsTable({ eventId, rows, archived = false }: { eventId: string; rows: Attendee[]; archived?: boolean }) {
  if (rows.length === 0) return <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No cancellation requests.</p>;
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Asked on</TableHead>
            <TableHead><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-semibold">{a.name}</TableCell>
              <TableCell className="text-muted-foreground">{a.email}</TableCell>
              <TableCell className="text-muted-foreground">{a.cancel_requested_at ? klDayTime(a.cancel_requested_at) : ""}</TableCell>
              <TableCell>
                {!archived && (
                  <div className="flex justify-end gap-2">
                    <form action={approveCancelRequestAction.bind(null, eventId, a.id)}><SubmitButton>Approve</SubmitButton></form>
                    <form action={declineCancelRequestAction.bind(null, eventId, a.id)}><SubmitButton variant="outline">Decline</SubmitButton></form>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
