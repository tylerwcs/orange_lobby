import type { ActivitySubmission, RegistrationQuestion } from "@/lib/types";
import { shortDate } from "@/lib/text";
import { signedSubmissionUrl } from "@/lib/db/media";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * D391/D398: the Edit and Delete controls for one entry, or null where it may not be changed.
 * Handed the signed links to the entry's current files, already minted here, so the form can
 * show them. `variant`: text links under the answers (default), or the tracker's ⋯ menu.
 */
export type EditEntry = (s: ActivitySubmission, fileLinks: Record<string, string | null>, variant?: "menu" | "links") => React.ReactNode;

/**
 * One list of submissions, newest first - this component only renders what it is given. Usually
 * this attendee's own answers to one form (`submissionsForAttendee` returns every form they have
 * ever answered, so the caller filters to `form_id` first); `GroupStatus` reuses it for a whole
 * group's entries to one group form, overriding `title`, `empty` and `byline` to say whose entry
 * each card is, rather than whose it always is.
 *
 * Async because a `file` answer holds an object path, not something to show as-is (D168): the
 * link is a signed URL minted right here, at render time, rather than stored anywhere — a
 * stored one would be dead by the time the attendee came back to look at it.
 */
export async function SubmissionHistory({ submissions, questions, title = "Your submissions", empty = "You have not submitted anything yet.", byline, addedBy, edit }: {
  submissions: ActivitySubmission[];
  questions: RegistrationQuestion[];
  title?: string;
  empty?: string;
  byline?: (s: ActivitySubmission) => string | null;
  /** D392: "Added by Adrian" on an entry a group member sent for this attendee. */
  addedBy?: (s: ActivitySubmission) => string | null;
  edit?: EditEntry;
}) {
  if (submissions.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  const labelFor = (key: string) => questions.find((q) => q.key === key)?.label ?? key;
  const isFile = (key: string) => questions.find((q) => q.key === key)?.type === "file";
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-extrabold">{title}</h2>
      {await Promise.all(submissions.map(async (s) => {
        // A show_when-hidden question stores "" rather than being omitted (see validateAnswers),
        // which would otherwise print as an empty line for every conditional question an
        // attendee never saw.
        const answered = Object.entries(s.answers).filter(([, v]) => v !== "");
        const rows = await Promise.all(answered.map(async ([key, value]) => ({
          key,
          value,
          href: isFile(key) ? await signedSubmissionUrl(value) : null,
        })));
        const by = byline?.(s);
        const added = s.submitted_by ? addedBy?.(s) : null;
        const editor = edit?.(s, Object.fromEntries(rows.filter((r) => isFile(r.key)).map((r) => [r.key, r.href])));
        return (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="text-[13px] font-bold text-muted-foreground">{shortDate(s.submitted_on)}</CardTitle>
              {/* D341: their history shows an edited submission's new answers, plus this note - */}
              {/* nothing is sent to them, so the note is the only sign anything changed. */}
              {s.edited_at
                ? <CardDescription className="text-[11px]">Updated by the organiser</CardDescription>
                : s.attendee_edited_at && <CardDescription className="text-[11px]">Edited</CardDescription>}
              {by && <CardDescription className="text-[11px]">{by}</CardDescription>}
              {added && <CardDescription className="text-[11px]">{added}</CardDescription>}
              {editor && <div className="text-xs font-bold text-primary">{editor}</div>}
            </CardHeader>
            {rows.length > 0 && (
              <CardContent className="flex flex-col gap-1.5">
                {rows.map(({ key, value, href }) => (
                  <div key={key} className="text-sm">
                    <span className="font-bold">{labelFor(key)}: </span>
                    {isFile(key) ? (
                      href ? (
                        <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">View file</a>
                      ) : (
                        <span className="text-muted-foreground">Unavailable</span>
                      )
                    ) : (
                      <span className="text-muted-foreground">{value}</span>
                    )}
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        );
      }))}
    </div>
  );
}
