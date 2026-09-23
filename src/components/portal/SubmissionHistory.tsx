import type { ActivitySubmission, RegistrationQuestion } from "@/lib/types";
import { shortDate } from "@/lib/text";
import { signedSubmissionUrl } from "@/lib/db/media";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * This attendee's own submissions to one form, newest first. `submissionsForAttendee` returns
 * every form this attendee has ever answered, so the caller filters to `form_id` before handing
 * the list here — this component only renders what it is given.
 *
 * Async because a `file` answer holds an object path, not something to show as-is (D168): the
 * link is a signed URL minted right here, at render time, rather than stored anywhere — a
 * stored one would be dead by the time the attendee came back to look at it.
 */
export async function SubmissionHistory({ submissions, questions }: {
  submissions: ActivitySubmission[];
  questions: RegistrationQuestion[];
}) {
  if (submissions.length === 0) {
    return <p className="text-sm text-muted-foreground">You have not submitted anything yet.</p>;
  }
  const labelFor = (key: string) => questions.find((q) => q.key === key)?.label ?? key;
  const isFile = (key: string) => questions.find((q) => q.key === key)?.type === "file";
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-extrabold">Your submissions</h2>
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
        return (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="text-[13px] font-bold text-muted-foreground">{shortDate(s.submitted_on)}</CardTitle>
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
