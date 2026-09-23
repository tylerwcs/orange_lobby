import Link from "next/link";
import { notFound } from "next/navigation";
import { Armchair, ArrowLeft, CalendarDays, CircleCheck, Clock, MapPin, Users } from "lucide-react";
import { loadPortalAttendee } from "@/lib/portal";
import { loadActivityEntries, type ActivityEntry, type SubmissionEntry } from "@/lib/portal-activity-entries";
import { dayRange } from "@/lib/activity-card";
import { submitLabel } from "@/lib/submissions";
import { sessionGrid } from "@/lib/session-grid";
import type { Activity } from "@/lib/types";
import { bookAction, requestSwitchAction, requestCancelAction, withdrawRequestAction, submitAnswersAction } from "../actions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { SubmissionHistory } from "@/components/portal/SubmissionHistory";
import { SubmissionFields } from "@/components/portal/SubmissionFields";
import { ActivitySessions } from "@/components/portal/ActivitySessions";
import { ActivityBooking } from "@/components/portal/ActivityBooking";
import { ActivityActionDialog } from "@/components/portal/ActivityActionDialog";
import { ActivityCover } from "@/components/portal/ActivityParts";
import { RichSections } from "@/components/portal/RichSections";

export const dynamic = "force-dynamic";

const block = "-mx-4 border-t-8 border-muted px-4 py-5 md:mx-0 md:px-0";
const note = "text-sm text-muted-foreground";

/**
 * One activity's own page, the same shape for both kinds (D178): the picture whole, the name,
 * when and where, the organiser's About and sections, where the attendee stands - then one
 * button at the foot of the page that opens what they do here in a dialog: the session grid,
 * or the submission's questions.
 *
 * Every action redirects back here, so the toast lands on the page it is about. The dialog is
 * keyed by what each action changes (seats held and requests open; submissions sent), so a
 * success remounts it closed and a refusal leaves it open.
 */
export default async function ActivityPage({ params, searchParams }: {
  params: Promise<{ slug: string; token: string; activityId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { slug, token, activityId } = await params;
  const { new: writing } = await searchParams;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  const { bookings, submissions } = await loadActivityEntries(event, attendee);
  const basePath = `/e/${slug}/a/${token}`;

  const booking = bookings.find((b) => b.state.activity.id === activityId && b.state.eligible);
  const form = submissions.find((s) => s.form.id === activityId);
  if (!booking && !form) notFound();
  const activity = booking ? booking.state.activity : form!.form;

  return (
    <div className="flex flex-col">
      <Link href={`${basePath}/activities`} className="mb-3 inline-flex items-center gap-1.5 self-start text-sm font-bold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />Activities
      </Link>
      <ActivityCover activity={activity} variant="hero" className="-mx-4 w-[calc(100%+2rem)] max-w-none md:mx-0 md:w-full md:rounded-2xl" />
      <h1 className="py-4 text-xl font-extrabold leading-tight">{activity.name}</h1>
      {booking
        ? <BookingBody entry={booking} slug={slug} token={token} />
        : <SubmissionBody entry={form!} slug={slug} token={token} writing={writing === "1"} />}
    </div>
  );
}

function BookingBody({ entry: { state, controls, pendingId }, slug, token }: { entry: ActivityEntry; slug: string; token: string }) {
  const { activity } = state;
  const grid = sessionGrid(state.sessions);
  const left = state.sessions.reduce((n, s) => n + s.left, 0);
  const n = state.sessions.length;
  // Something to do in the dialog: a seat to book, or - holding one - another to ask to move to.
  const canAct = !state.closed && !controls.pending && (controls.bookable.length > 0 || controls.switchTargets.length > 0);
  const holding = state.held > 0;
  return (
    <>
      <InfoRows
        rows={[
          { icon: CalendarDays, text: dayRange(state.sessions.map((s) => s.session.day)) },
          { icon: MapPin, text: [grid.location, grid.minutes ? `${grid.minutes} min each` : null].filter(Boolean).join(" · ") || null },
          { icon: Armchair, text: n ? `${left} seat${left === 1 ? "" : "s"} left across ${n} session${n === 1 ? "" : "s"}` : null },
          { icon: Users, text: forGroups(activity) },
        ]}
      />
      <RichSections html={activity.description} />
      <section className={`${block} flex flex-col gap-3`}>
        <h2 className="text-lg font-extrabold">Your session</h2>
        <ActivityBooking
          controls={controls}
          pendingId={pendingId}
          requestCancel={requestCancelAction.bind(null, slug, token)}
          withdraw={withdrawRequestAction.bind(null, slug, token)}
        />
        {!holding && !controls.pending && (
          <p className={note}>
            {n === 0 ? "Sessions will be added soon."
              : state.closed ? "Booking is closed. Speak to the registration desk."
              : left === 0 ? "Every session is full."
              : state.mustPick ? "Everyone needs one session. Tap Book your session to pick yours."
              : "You have not booked a session yet."}
          </p>
        )}
      </section>
      {canAct && (
        <ActivityActionDialog
          key={`${state.held}:${pendingId ?? ""}`}
          label={holding ? "Change session" : "Book your session"}
          title={activity.name}
          description={holding ? "Pick another time. The desk approves the move." : state.mustPick ? "Choose one session. The desk can move you later." : "Pick a time."}
        >
          <ActivitySessions
            entry={{ state, controls }}
            actions={{ book: bookAction.bind(null, slug, token), requestSwitch: requestSwitchAction.bind(null, slug, token) }}
          />
        </ActivityActionDialog>
      )}
    </>
  );
}

function SubmissionBody({ entry: { form: f, state, mine }, slug, token, writing }: {
  entry: SubmissionEntry;
  slug: string;
  token: string;
  writing: boolean;
}) {
  const dates = f.starts_on ? dayRange([f.starts_on, f.ends_on ?? f.starts_on]) : null;
  return (
    <>
      <InfoRows rows={[{ icon: CalendarDays, text: dates }, { icon: MapPin, text: f.venue }, { icon: Users, text: forGroups(f) }]} />
      <RichSections html={f.description} />
      <section className={block}>
        {(state.reason === "limit" || state.reason === "today") && <Done today={state.reason === "today"} />}
        <SubmissionHistory submissions={mine} questions={f.questions} />
        {state.reason === "closed" && <p className={`mt-3 ${note}`}>Submissions for this are closed.</p>}
        {state.reason === "ineligible" && <p className={`mt-3 ${note}`}>This is not open to your group.</p>}
      </section>
      {state.can && (
        <ActivityActionDialog key={mine.length} label={submitLabel(f)} title={f.name} defaultOpen={writing}>
          <form action={submitAnswersAction.bind(null, slug, token, f.id)} className="flex flex-col gap-6">
            {f.questions.length > 0 && <SubmissionFields questions={f.questions} />}
            <SubmitButton className="h-12 w-full text-base font-bold">Submit</SubmitButton>
          </form>
        </ActivityActionDialog>
      )}
    </>
  );
}

/** The good news where the button was: a green tick, and for a daily one, when to come back. */
function Done({ today }: { today: boolean }) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-success-strong">
      <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div>
        <div className="font-bold">{today ? "Submission done for today" : "Submission done"}</div>
        {today && <div className="text-sm">Come back tomorrow to send the next one.</div>}
      </div>
    </div>
  );
}

/** "For VIP, Management" when only some groups may take part; nothing when everyone may. */
function forGroups(activity: Pick<Activity, "categories">): string | null {
  return activity.categories?.length ? `For ${activity.categories.join(", ")}` : null;
}

function InfoRows({ rows }: { rows: { icon: typeof Clock; text: string | null }[] }) {
  const shown = rows.filter((r) => r.text);
  if (shown.length === 0) return null;
  return (
    <div className="-mx-4 flex flex-col border-t border-border px-4 md:mx-0 md:px-0">
      {shown.map(({ icon: Icon, text }) => (
        <div key={text} className="flex items-center gap-3 border-b border-border py-3 text-sm">
          <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          {text}
        </div>
      ))}
    </div>
  );
}
