import type { FormSubmission, RegistrationQuestion } from "@/lib/types";
import { shortDate } from "@/lib/text";
import { signedSubmissionUrl } from "@/lib/db/media";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export type SubmitterInfo = { name: string; email: string | null; category: string | null };

/**
 * One row per submission, newest first (the caller hands them in that order — `submissionsForForm`
 * already sorts that way, so this never re-sorts). One column per question, in the order the
 * form declares them, matching the shape of the xlsx export so the two agree on what "the
 * columns" are.
 *
 * Async for the same reason SubmissionHistory is: a `file` answer is an object path, and the
 * signed link that makes it clickable is minted at render time, not stored (D168). A signature
 * that came back null (the object went missing from storage) is shown as "Unavailable" rather
 * than a link that 404s.
 */
export async function SubmissionTable({ submissions, questions, submitterFor }: {
  submissions: FormSubmission[];
  questions: RegistrationQuestion[];
  submitterFor: (attendeeId: string) => SubmitterInfo;
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
  const rows = await Promise.all(submissions.map(async (s) => {
    const who = submitterFor(s.attendee_id);
    const cells = await Promise.all(questions.map(async (q) => {
      const value = s.answers[q.key] ?? "";
      if (!isFile(q.key)) return { key: q.key, value, href: null as string | null };
      return { key: q.key, value, href: value ? await signedSubmissionUrl(value) : null };
    }));
    return { submission: s, who, cells };
  }));

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Submitted</TableHead>
          <TableHead>Attendee</TableHead>
          <TableHead>Category</TableHead>
          {questions.map((q) => <TableHead key={q.key}>{q.label}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ submission, who, cells }) => (
          <TableRow key={submission.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground">{shortDate(submission.submitted_on)}</TableCell>
            <TableCell>
              <div className="font-semibold">{who.name}</div>
              {who.email && <div className="text-xs text-muted-foreground">{who.email}</div>}
            </TableCell>
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
