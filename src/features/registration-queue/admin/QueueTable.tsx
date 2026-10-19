import type { RegistrationEntry } from "@/lib/types";
import type { AttendeeField } from "@/lib/attendee-fields";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { klDayTime } from "@/features/cancel/client";
import { approveEntryAction, declineEntryAction, moveInAction, removeEntryAction } from "./actions";

/**
 * D685 / D698: the waiting list (in queue order, with each person's place) or the registrations
 * waiting for approval (oldest first, with their answers to open). Plain server forms, like
 * CancelRequestsTable, so the buttons work before the page has hydrated. Admins and committee
 * alike. An archived event is read-only: the rows show, the buttons do not.
 *
 * `fields` are the event's columns; the phone one is shown as Mobile, and the rest label the
 * answers on a pending row.
 */
export function QueueTable({ eventId, view, rows, fields, archived = false }: {
  eventId: string;
  view: "waitlist" | "pending";
  rows: RegistrationEntry[];
  fields: AttendeeField[];
  archived?: boolean;
}) {
  const waiting = view === "waitlist";
  if (rows.length === 0) {
    return <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">{waiting ? "No one is on the waiting list." : "No registrations are waiting for approval."}</p>;
  }
  const phone = fields.find((f) => f.type === "phone");
  const answerFields = fields.filter((f) => f !== phone);
  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {waiting && <TableHead className="w-12">No.</TableHead>}
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Mobile</TableHead>
            <TableHead>{waiting ? "Joined on" : "Applied on"}</TableHead>
            {!waiting && <TableHead>Answers</TableHead>}
            <TableHead><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e, i) => {
            const answers = answerFields.flatMap((f) => {
              const v = e.extra?.[f.key]?.trim();
              return v ? [[f.label, v] as const] : [];
            });
            return (
              <TableRow key={e.id}>
                {waiting && <TableCell className="tabular-nums text-muted-foreground">{i + 1}</TableCell>}
                <TableCell className="font-semibold">{e.name}</TableCell>
                <TableCell className="text-muted-foreground">{e.email}</TableCell>
                <TableCell className="text-muted-foreground">{(phone && e.extra?.[phone.key]?.trim()) || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{klDayTime(e.joined_at)}</TableCell>
                {!waiting && (
                  <TableCell className="min-w-48 max-w-md">
                    {answers.length === 0 ? <span className="text-muted-foreground">—</span> : (
                      <details>
                        <summary className="cursor-pointer text-sm font-medium">{answers.length} {answers.length === 1 ? "answer" : "answers"}</summary>
                        <dl className="mt-2 grid gap-1 text-xs">
                          {answers.map(([label, v]) => (
                            <div key={label}><dt className="font-bold">{label}</dt><dd className="whitespace-pre-line text-muted-foreground">{v}</dd></div>
                          ))}
                        </dl>
                      </details>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  {!archived && (
                    <div className="flex justify-end gap-2">
                      {waiting ? (<>
                        <form action={moveInAction.bind(null, eventId, e.id)}><SubmitButton>Move in</SubmitButton></form>
                        <form action={removeEntryAction.bind(null, eventId, e.id)}>
                          <ConfirmButton message={`Take ${e.name} off the waiting list? They are not told.`} confirmLabel="Remove">Remove</ConfirmButton>
                        </form>
                      </>) : (<>
                        <form action={approveEntryAction.bind(null, eventId, e.id)}><SubmitButton>Approve</SubmitButton></form>
                        <form action={declineEntryAction.bind(null, eventId, e.id)}>
                          <ConfirmButton message={`Decline ${e.name}? Their link will say the organiser couldn't confirm their place. They are not sent a message.`} confirmLabel="Decline">Decline</ConfirmButton>
                        </form>
                      </>)}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
