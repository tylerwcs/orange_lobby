import type { ActivitySubmission, RegistrationQuestion } from "@/lib/types";
import { shortDate, shortDateTime } from "@/lib/text";
import { adminFileHref } from "@/lib/file-links";
import { retiredAnswerKeys } from "@/lib/exports";
import { RowActions } from "@/components/admin/RowActions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { SubmissionFields } from "./SubmissionFields";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export type SubmitterInfo = { name: string; email: string | null; category: string | null };

/**
 * One row per submission, newest first (the caller hands them in that order — `submissionsForActivity`
 * already sorts that way, so this never re-sorts). One column per question, in the order the
 * form declares them, matching the shape of the xlsx export so the two agree on what "the
 * columns" are.
 *
 * A `file` answer is an object path (D168). Its "View file" points at the admin file route
 * (D399), which signs a fresh link at the click: one minted here at render time was dead a
 * minute later, long before a committee working down the table clicked it.
 *
 * Every row stays, revoked ones too (D340): greyed, marked Revoked, and with no menu, since a
 * revoked row cannot be edited. A live row's ⋯ menu edits its answers in the portal's own
 * fields (D337) or revokes it. The page's count is of live rows only (D339).
 */
export function SubmissionTable({ submissions, questions, submitterFor, edit, revoke, adminNames, groupFor }: {
  submissions: ActivitySubmission[];
  questions: RegistrationQuestion[];
  submitterFor: (attendeeId: string) => SubmitterInfo;
  edit: (submissionId: string, fd: FormData) => Promise<void>;
  revoke: (submissionId: string) => Promise<void>;
  /** `edited_by`/`revoked_by` resolved to an email via `scannerNames`; unresolved ids are missing. */
  adminNames: Record<string, string>;
  /** D359: a group form's submissions carry the group they were sent for. */
  groupFor?: (s: ActivitySubmission) => string;
}) {
  if (submissions.length === 0) {
    return (
      <Empty className="border-0 bg-transparent">
        <EmptyHeader>
          <EmptyTitle>No submissions yet</EmptyTitle>
          <EmptyDescription>They appear here once an attendee sends this in from the portal.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const isFile = (key: string) => questions.find((q) => q.key === key)?.type === "file";
  // Keys present in the data but no longer among `questions` — see retiredAnswerKeys
  // (src/lib/exports.ts). Those answers are real and immutable (D166); dropping them from
  // this table because their key retired would make them unreachable through the one admin
  // surface that shows them. Its own trailing column, headed plainly as retired, rather than
  // folded into `questions`' columns: there is no label to show for a key nothing declares
  // any more, and no way to know it was ever a `file` answer, so it always renders as plain
  // text.
  const retiredKeys = retiredAnswerKeys(questions.map((q) => q.key), submissions.map((s) => s.answers));

  const stamp = (verb: string, by: string | null, at: string | null) =>
    `${verb} by ${(by ? adminNames[by] : undefined) ?? "an admin"}${at ? ` on ${shortDateTime(at)}` : ""}`;

  const rows = submissions.map((s) => {
    const who = submitterFor(s.attendee_id);
    const cells = questions.map((q) => {
      const value = s.answers[q.key] ?? "";
      if (!isFile(q.key)) return { key: q.key, value, href: null as string | null };
      return { key: q.key, value, href: value ? adminFileHref(s.event_id, s.id, q.key) : null };
    });
    const retiredCells = retiredKeys.map((key) => ({ key, value: s.answers[key] ?? "" }));
    const fileLinks = Object.fromEntries(cells.filter((c) => isFile(c.key)).map((c) => [c.key, c.href]));
    return { submission: s, who, cells, retiredCells, fileLinks };
  });

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Submitted</TableHead>
          <TableHead>Attendee</TableHead>
          {groupFor && <TableHead>Group</TableHead>}
          <TableHead>Category</TableHead>
          {questions.map((q) => <TableHead key={q.key}>{q.label}</TableHead>)}
          {retiredKeys.map((k) => <TableHead key={k}>{k} (retired)</TableHead>)}
          <TableHead><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ submission, who, cells, retiredCells, fileLinks }) => {
          const revoked = submission.status === "revoked";
          return (
            <TableRow key={submission.id} className={revoked ? "opacity-60" : undefined}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                <div>{shortDate(submission.submitted_on)}</div>
                {(revoked || submission.edited_at || submission.attendee_edited_at) && (
                  <div className="mt-1 flex gap-1">
                    {revoked && <Badge variant="secondary" title={stamp("Revoked", submission.revoked_by, submission.revoked_at)}>Revoked</Badge>}
                    {(submission.edited_at || submission.attendee_edited_at) && (
                      <Badge variant="outline" title={[
                        submission.edited_at && stamp("Edited", submission.edited_by, submission.edited_at),
                        submission.attendee_edited_at && `Edited by the attendee on ${shortDateTime(submission.attendee_edited_at)}`,
                      ].filter(Boolean).join("\n")}>Edited</Badge>
                    )}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <div className="font-semibold">{who.name}</div>
                {submission.submitted_by && <div className="text-xs text-muted-foreground">Added by {submitterFor(submission.submitted_by).name}</div>}
                {who.email && <div className="text-xs text-muted-foreground">{who.email}</div>}
              </TableCell>
              {groupFor && <TableCell className="text-muted-foreground">{groupFor(submission)}</TableCell>}
              <TableCell className="text-muted-foreground">{who.category ?? "—"}</TableCell>
              {cells.map(({ key, value, href }) => (
                <TableCell key={key}>
                  {isFile(key) ? (
                    value === "" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : href ? (
                      <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">View file</a>
                    ) : (
                      <span className="text-muted-foreground">Unavailable</span>
                    )
                  ) : (
                    value || <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              ))}
              {retiredCells.map(({ key, value }) => (
                <TableCell key={key} className="text-muted-foreground">{value || "—"}</TableCell>
              ))}
              <TableCell className="text-right">
                {!revoked && (
                  <RowActions
                    name={`${who.name}'s submission`}
                    edit={questions.length > 0 ? {
                      title: "Edit answers",
                      form: (
                        <form action={edit.bind(null, submission.id)} className="grid gap-4 p-1">
                          <SubmissionFields questions={questions} defaults={submission.answers} fileLinks={fileLinks} />
                          <SubmitButton>Save answers</SubmitButton>
                        </form>
                      ),
                    } : undefined}
                    remove={{
                      action: revoke.bind(null, submission.id),
                      label: "Revoke",
                      message: "It stops counting and they can submit again. It stays here, marked Revoked.",
                    }}
                  />
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
