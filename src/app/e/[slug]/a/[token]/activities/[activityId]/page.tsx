import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { loadPortalAttendee } from "@/lib/portal";
import { loadActivityEntries } from "@/lib/portal-activity-entries";
import { bookingCard, dayRange, formCard, type CardView } from "@/lib/activity-card";
import { capSummary, type SubmitReason } from "@/lib/submissions";
import { sessionGrid } from "@/lib/session-grid";
import type { Activity } from "@/lib/types";
import { cn } from "@/lib/utils";
import { bookAction, requestSwitchAction, requestCancelAction, withdrawRequestAction, submitAnswersAction } from "../actions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { SubmissionHistory } from "@/components/portal/SubmissionHistory";
import { SubmissionFields } from "@/components/portal/SubmissionFields";
import { ActivitySessions } from "@/components/portal/ActivitySessions";
import { ActivityCover, KindTag, StatusChip } from "@/components/portal/ActivityParts";
import { RichSections } from "@/components/portal/RichSections";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/** What the attendee reads in place of the submit button when `canSubmit` says no (D167). */
const REFUSAL: Record<Exclude<SubmitReason, "ok">, string> = {
  closed: "This form is closed.",
  ineligible: "This form is not open to your group.",
  limit: "You have sent all the entries this form takes.",
  today: "You have already submitted today. Come back tomorrow.",
};

const block = "-mx-4 border-t-8 border-muted px-4 py-5 md:mx-0 md:px-0";
/** Floats above the portal's bottom bar on a phone; the same clearance the session bar uses. */
const stickyCta = "sticky bottom-20 z-10 mt-2 md:bottom-4";

/**
 * One activity's own page, for both kinds (D178): the picture whole, what it is and where,
 * the organiser's About and sections, then what the attendee does here - pick a session, or
 * send the form.
 *
 * A page rather than the sheet it replaced: the poster and the sections are read, not
 * glanced at, and a page has room for them and a back button that works. The booking and
 * form actions redirect back here, so the toast lands on the page it is about.
 *
 * The form is somewhere you GO (`?new=1`) - a URL, not client state, so the back button works
 * and a reload keeps its place. While writing, only the head stays: the form is what matters.
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
  const back = (
    <Link href={`${basePath}/activities`} className="mb-3 inline-flex items-center gap-1.5 self-start text-sm font-bold text-muted-foreground hover:text-foreground">
      <ArrowLeft aria-hidden className="size-4" />Activities
    </Link>
  );
  const head = (
    <>
      {back}
      <ActivityCover activity={activity} variant="hero" className="-mx-4 w-[calc(100%+2rem)] max-w-none md:mx-0 md:w-full md:rounded-2xl" />
    </>
  );
  const title = (
    <div className="flex flex-col gap-1.5 py-4">
      <h1 className="text-xl font-extrabold leading-tight">{activity.name}</h1>
      <div><KindTag kind={activity.kind} /></div>
    </div>
  );

  if (booking) {
    const { state, controls, pendingId } = booking;
    const view = bookingCard({ state, pending: controls.pending !== null });
    const grid = sessionGrid(state.sessions);
    const left = state.sessions.reduce((n, s) => n + s.left, 0);
    const n = state.sessions.length;
    return (
      <div className="flex flex-col">
        {head}
        <Facts status={view.status} items={n ? [`${left} seat${left === 1 ? "" : "s"} left`, `${n} session${n === 1 ? "" : "s"}`] : []} />
        {title}
        <InfoRows
          rows={[
            { icon: CalendarDays, text: dayRange(state.sessions.map((s) => s.session.day)) },
            { icon: MapPin, text: [grid.location, grid.minutes ? `${grid.minutes} min each` : null].filter(Boolean).join(" · ") || null },
            { icon: Users, text: forGroups(activity) },
          ]}
        />
        <RichSections html={activity.description} />
        <section className={block}>
          <h2 className="mb-3 text-lg font-extrabold">{state.held > 0 ? "Your session" : "Pick a time"}</h2>
          <ActivitySessions
            entry={{ state, controls, pendingId }}
            actions={{
              book: bookAction.bind(null, slug, token),
              requestSwitch: requestSwitchAction.bind(null, slug, token),
              requestCancel: requestCancelAction.bind(null, slug, token),
              withdraw: withdrawRequestAction.bind(null, slug, token),
            }}
          />
        </section>
      </div>
    );
  }

  const { form: f, state, mine } = form!;
  const view = formCard({ form: f, state });
  const base = `${basePath}/activities/${f.id}`;

  if (writing === "1" && state.can) {
    return (
      <div className="flex flex-col">
        {head}
        {title}
        <Card>
          <CardContent className="pt-6">
            <form action={submitAnswersAction.bind(null, slug, token, f.id)} className="flex flex-col gap-6">
              {f.questions.length > 0 && <SubmissionFields questions={f.questions} />}
              <SubmitButton className="h-12 w-full text-base font-bold">Submit</SubmitButton>
            </form>
          </CardContent>
        </Card>
        <Link href={base} className="mt-4 self-start text-sm font-bold text-primary underline-offset-4 hover:underline">
          Cancel
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {head}
      <Facts status={view.status} items={[capSummary(f), view.meta?.icon === "send" ? view.meta.text : `${state.used} sent`]} />
      {title}
      <InfoRows rows={[{ icon: Users, text: forGroups(f) }]} />
      <RichSections html={f.description} />
      <section className={block}>
        <SubmissionHistory submissions={mine} questions={f.questions} />
        {/* The reason lives here rather than on a disabled button: when they cannot send
            another there is no button at all, and a sentence saying why is more use. */}
        {!state.can && <p className="mt-3 text-sm text-muted-foreground">{REFUSAL[state.reason as Exclude<SubmitReason, "ok">]}</p>}
      </section>
      {state.can && (
        <div className={stickyCta}>
          <Link href={`${base}?new=1`} className={cn(buttonVariants({ size: "lg" }), "h-12 w-full rounded-full text-base font-bold shadow-lg")}>
            {mine.length === 0 ? "Fill in" : "Send another"}
          </Link>
        </div>
      )}
    </div>
  );
}

/** "For VIP, Management" when only some groups may take part; nothing when everyone may. */
function forGroups(activity: Pick<Activity, "categories">): string | null {
  return activity.categories?.length ? `For ${activity.categories.join(", ")}` : null;
}

/** The strip under the picture: the one-word state first, then the numbers that matter. */
function Facts({ status, items }: { status: CardView["status"]; items: string[] }) {
  if (!status && items.length === 0) return null;
  return (
    <div className="-mx-4 flex flex-wrap items-center gap-x-4 gap-y-1 bg-muted/60 px-4 py-2.5 text-xs text-muted-foreground md:mx-0 md:mt-3 md:rounded-xl">
      {status && <StatusChip status={status} />}
      {items.map((t) => <span key={t} className="tabular-nums">{t}</span>)}
    </div>
  );
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
