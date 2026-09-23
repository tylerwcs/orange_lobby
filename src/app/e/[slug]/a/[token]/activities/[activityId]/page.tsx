import { notFound } from "next/navigation";
import { loadPortalAttendee } from "@/lib/portal";
import { getActivity, submissionsForAttendee } from "@/lib/db/activities";
import { canSubmit, type SubmitReason } from "@/lib/submissions";
import { UPLOAD_ACCEPT } from "@/lib/storage";
import { nowInKL } from "@/lib/time";
import type { RegistrationQuestion } from "@/lib/types";
import { submitAnswersAction } from "../actions";
import { SubmissionHistory } from "@/components/portal/SubmissionHistory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import Link from "next/link";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

const inputClass = "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

/** What the attendee reads in place of the submit button when `canSubmit` says no (D167). */
const REFUSAL: Record<Exclude<SubmitReason, "ok">, string> = {
  closed: "This form is closed.",
  ineligible: "This form is not open to your group.",
  limit: "You have sent all the entries this form takes.",
  today: "You have already submitted today. Come back tomorrow.",
};

/** One question, switched on `q.type`. */
function renderQuestion(q: RegistrationQuestion) {
  const id = `q-${q.key}`;
  if (q.type === "select") {
    return (
      <select id={id} name={q.key} required={q.required} className={inputClass}>
        <option value="">Select…</option>
        {q.options!.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (q.type === "textarea") {
    return <textarea id={id} name={q.key} required={q.required} rows={5} className={inputClass} />;
  }
  if (q.type === "file") {
    return (
      <input
        id={id}
        name={q.key}
        type="file"
        accept={UPLOAD_ACCEPT}
        required={q.required}
        /* `flex items-center` is the fix for the button sitting high in the box. `inputClass`
           sets a 44px height with no vertical padding, and a file input lays its shadow button
           out on a baseline-aligned line box — unlike a text input, which browsers centre
           internally as a special case. Flex makes the centring explicit instead of hoping the
           line box lands in the middle. */
        className={`${inputClass} flex items-center file:mr-3 file:rounded-[8px] file:border-0 file:bg-foreground file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-white`}
      />
    );
  }
  const type = q.type === "phone" ? "tel" : q.type === "number" ? "number" : "text";
  return <input id={id} name={q.key} type={type} required={q.required} className={inputClass} />;
}

export default async function ActivitySubmissionPage({ params, searchParams }: {
  params: Promise<{ slug: string; token: string; activityId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { slug, token, activityId } = await params;
  const { new: writing } = await searchParams;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const activity = await getActivity(activityId, event.id);
  // A booking activity has no questions and no answers — this route is a submission's alone
  // (D178), the same way `book_session` refuses a submission activity's id.
  if (!activity || activity.kind !== "submission") notFound();

  const submissions = await submissionsForAttendee(attendee.id);
  const mine = submissions.filter((s) => s.activity_id === activity.id);
  const today = nowInKL().date;
  const state = canSubmit(activity, mine, attendee.category, today);

  const base = `/e/${slug}/a/${token}/activities/${activity.id}`;
  // What an attendee comes back to is what they have already sent, so that is the page. The
  // form is somewhere you GO — a URL, not a piece of client state, so the back button works,
  // a reload keeps its place, and none of this needs to become a client component.
  const composing = writing === "1" && state.can;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-extrabold">{activity.name}</h1>
        {activity.description && <p className="text-sm text-muted-foreground">{activity.description}</p>}
      </div>

      {composing ? (
        <>
          <Card>
            <CardContent className="pt-6">
              <form action={submitAnswersAction.bind(null, slug, token, activity.id)} className="flex flex-col gap-6">
                {activity.questions.length > 0 && (
                  <FieldSet>
                    <FieldGroup>
                      {activity.questions.map((q) => (
                        <Field key={q.key}>
                          <FieldLabel htmlFor={`q-${q.key}`}>
                            {q.label}
                            {!q.required && <span className="font-normal text-muted-foreground">(optional)</span>}
                          </FieldLabel>
                          {q.description && <FieldDescription>{q.description}</FieldDescription>}
                          {renderQuestion(q)}
                        </Field>
                      ))}
                    </FieldGroup>
                  </FieldSet>
                )}
                <Button type="submit" className="h-12 w-full text-base font-bold">Submit</Button>
              </form>
            </CardContent>
          </Card>
          <Link href={base} className="self-start text-sm font-bold text-primary underline-offset-4 hover:underline">
            Cancel
          </Link>
        </>
      ) : (
        <>
          <SubmissionHistory submissions={mine} questions={activity.questions} />

          {/* The reason lives here rather than on a disabled button: when they cannot send
              another there is no button at all, and a sentence saying why is more use than a
              control that refuses. */}
          {!state.can && (
            <p className="text-sm text-muted-foreground">{REFUSAL[state.reason as Exclude<SubmitReason, "ok">]}</p>
          )}

          {state.can && (
            <Link
              href={`${base}?new=1`}
              aria-label={mine.length === 0 ? "Send your first submission" : "Send another submission"}
              /* bottom-24 clears the portal's fixed bottom nav at the same breakpoint the nav
                 itself uses, the clearance <main> and the toaster already agree on. */
              className="fixed bottom-24 right-4 z-10 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:bottom-8 md:right-8"
            >
              <Plus className="size-6" aria-hidden="true" />
            </Link>
          )}
        </>
      )}
    </div>
  );
}
