import type { FormSubmission, RegistrationQuestion } from "@/lib/types";
import { shortDate } from "@/lib/text";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * This attendee's own submissions to one form, newest first. `submissionsForAttendee` returns
 * every form this attendee has ever answered, so the caller filters to `form_id` before handing
 * the list here — this component only renders what it is given.
 */
export function SubmissionHistory({ submissions, questions }: {
  submissions: FormSubmission[];
  questions: RegistrationQuestion[];
}) {
  if (submissions.length === 0) {
    return <p className="text-sm text-muted-foreground">You have not sent anything to this form yet.</p>;
  }
  const labelFor = (key: string) => questions.find((q) => q.key === key)?.label ?? key;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-extrabold">Your submissions</h2>
      {submissions.map((s) => {
        // A show_when-hidden question stores "" rather than being omitted (see validateAnswers),
        // which would otherwise print as an empty line for every conditional question an
        // attendee never saw.
        const answered = Object.entries(s.answers).filter(([, v]) => v !== "");
        return (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="text-[13px] font-bold text-muted-foreground">{shortDate(s.submitted_on)}</CardTitle>
            </CardHeader>
            {answered.length > 0 && (
              <CardContent className="flex flex-col gap-1.5">
                {answered.map(([key, value]) => (
                  <div key={key} className="text-sm">
                    <span className="font-bold">{labelFor(key)}: </span>
                    <span className="text-muted-foreground">{value}</span>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
