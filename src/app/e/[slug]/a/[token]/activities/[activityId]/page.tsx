import Link from "next/link";
import { notFound } from "next/navigation";
import { Armchair, ArrowLeft, CalendarDays, CalendarPlus, CircleCheck, Clock, MapPin, Users } from "lucide-react";
import { loadPortalAttendee, isUnpublished } from "@/lib/portal";
import { loadActivityEntries, type ActivityEntry, type SubmissionEntry, type PassportEntry } from "@/lib/portal-activity-entries";
import { dayRange } from "@/lib/activity-card";
import { isGroupForm, submitLabel } from "@/lib/submissions";
import { nowInKL } from "@/lib/time";
import { buildTracker, trackerTab, type TrackerTab } from "@/lib/tracker";
import { standingLine } from "@/lib/leaderboard";
import { entriesForAttendee } from "@/lib/db/activities";
import { sessionGrid } from "@/lib/session-grid";
import { allCheckedIn } from "@/lib/booking-door";
import type { Activity } from "@/lib/types";
import { bookAction, requestSwitchAction, requestCancelAction, withdrawRequestAction, submitAnswersAction } from "../actions";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { buttonVariants } from "@/components/ui/button";
import { SubmissionHistory } from "@/components/portal/SubmissionHistory";
import { GroupStatus } from "@/components/portal/GroupStatus";
import { SubmissionFields } from "@/components/portal/SubmissionFields";
import { ActivitySessions } from "@/components/portal/ActivitySessions";
import { ActivityBooking } from "@/components/portal/ActivityBooking";
import { ActivityActionDialog } from "@/components/portal/ActivityActionDialog";
import { ActivityCover } from "@/components/portal/ActivityParts";
import { RichSections } from "@/components/portal/RichSections";
import { PassportGrid } from "@/components/portal/PassportGrid";
import { WeekStrip } from "@/components/portal/tracker/WeekStrip";
import { DayRing } from "@/components/portal/tracker/DayRing";
import { EntryTimeline } from "@/components/portal/tracker/EntryTimeline";
import { MyTeam } from "@/components/portal/tracker/MyTeam";
import { Leaderboard } from "@/components/portal/tracker/Leaderboard";
import { TrackerTabs } from "@/components/portal/tracker/TrackerTabs";
import { PendingScope, PendingSwap } from "@/components/PendingNav";
import { Skeleton } from "@/components/ui/skeletons";
import { loadChallenge } from "@/lib/challenge-data";

export const dynamic = "force-dynamic";

const block = "-mx-4 border-t-8 border-muted px-4 py-5 md:mx-0 md:px-0";
const note = "text-sm text-muted-foreground";

/**
 * One activity's own page, the same shape for all three kinds (D178): the picture whole, the
 * name, when and where, the organiser's About and sections, where the attendee stands - then
 * one button at the foot of the page that opens what they do here in a dialog: the session
 * grid, or the submission's questions. A passport has no dialog and no button - the attendee
 * does nothing here, a booth scans their badge (D90).
 *
 * Every action redirects back here, so the toast lands on the page it is about. The dialog is
 * keyed by what each action changes (seats held and requests open; submissions sent), so a
 * success remounts it closed and a refusal leaves it open.
 *
 * A scored challenge (D374) swaps the submission body for its tracker, in three tabs (D385):
 * `?tab=info`, My stats (no param; `?day=` shows another day of it) and `?tab=leaderboard`.
 */
export default async function ActivityPage({ params, searchParams }: {
  params: Promise<{ slug: string; token: string; activityId: string }>;
  searchParams: Promise<{ new?: string | string[]; day?: string | string[]; tab?: string | string[] }>;
}) {
  const { slug, token, activityId } = await params;
  const { new: writing, day, tab } = await searchParams;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // A draft shows only "Coming soon" (the layout's chrome); see isUnpublished.
  if (isUnpublished(event)) return null;
  const { bookings, submissions, passports, people } = await loadActivityEntries(event, attendee);
  const basePath = `/e/${slug}/a/${token}`;

  const booking = bookings.find((b) => b.state.activity.id === activityId && b.state.eligible);
  const form = submissions.find((s) => s.form.id === activityId);
  const stampCard = passports.find((p) => p.activity.id === activityId);
  if (!booking && !form && !stampCard) notFound();
  const activity = booking ? booking.state.activity : form ? form.form : stampCard!.activity;

  return (
    <div className="flex flex-col">
      <Link href={`${basePath}/activities`} className="mb-3 inline-flex items-center gap-1.5 self-start text-sm font-bold text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" />Activities
      </Link>
      <ActivityCover activity={activity} variant="hero" />
      <h1 className="py-4 text-xl font-extrabold leading-tight">{activity.name}</h1>
      {booking
        ? <BookingBody entry={booking} slug={slug} token={token} />
        : form
          ? form.form.scoring
            ? <TrackerBody entry={form} slug={slug} token={token} attendeeId={attendee.id} teamId={attendee.group_id} eventStartsOn={event.starts_on}
                day={typeof day === "string" ? day : null} writing={writing === "1"}
                // An old `?new=1` link opens the add dialog, which lives on My stats (D385).
                tab={writing === "1" ? "stats" : trackerTab(typeof tab === "string" ? tab : undefined)} />
            : <SubmissionBody entry={form} slug={slug} token={token} writing={writing === "1"} people={people} selfId={attendee.id} />
          : <PassportBody entry={stampCard!} attendeeName={attendee.name} />}
    </div>
  );
}

function BookingBody({ entry: { state, controls, pendingId, arrivals }, slug, token }: { entry: ActivityEntry; slug: string; token: string }) {
  const { activity } = state;
  const grid = sessionGrid(state.sessions);
  const left = state.sessions.reduce((n, s) => n + s.left, 0);
  const n = state.sessions.length;
  const holding = state.held > 0;
  // D336: once every held session has an arrival, the session is finished. This gates `canAct`
  // below (so every route to a Change session dialog disappears - the inline link, the
  // standalone button, and the one passed as `change`), the sticky Add to calendar button, and,
  // inside ActivityBooking, that seat's own calendar link and Ask to cancel.
  const done = allCheckedIn({ controls, arrivals });
  // Something to do in the dialog: a seat to book, or - holding one - another to ask to move to.
  // `!done` first: once every held session is checked in there is nothing left to switch.
  const canAct = !done && !state.closed && !controls.pending && (controls.bookable.length > 0 || controls.switchTargets.length > 0);
  const calendarPath = `/e/${slug}/a/${token}/activities/${activity.id}/calendar.ics`;
  // Booked on one session, the thing left to do is put it in the calendar, so that is the big
  // button and Change session becomes a link on the booked line. With several seats one
  // button cannot name them all, so each line keeps its own calendar link as before.
  const single = controls.held.length === 1 ? controls.held[0] : null;
  const dialog = (inline: boolean) => (
    <ActivityActionDialog
      key={`${state.held}:${pendingId ?? ""}`}
      inline={inline}
      label={holding ? "Change session" : "Book your session"}
      title={activity.name}
      description={holding ? "Pick another time. The committee approves the move." : state.mustPick ? "Choose one session. The committee can move you later." : "Pick a time."}
    >
      <ActivitySessions
        entry={{ state, controls }}
        actions={{ book: bookAction.bind(null, slug, token), requestSwitch: requestSwitchAction.bind(null, slug, token) }}
      />
    </ActivityActionDialog>
  );
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
          calendarPath={calendarPath}
          change={single ? (canAct ? dialog(true) : null) : undefined}
          requestCancel={requestCancelAction.bind(null, slug, token)}
          withdraw={withdrawRequestAction.bind(null, slug, token)}
          arrivals={arrivals}
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
      {single ? (
        !done && (
          <div className="sticky bottom-4 z-10 mt-2">
            {/* A plain <a>, not <Link>: it is a file, not a page, and must not be prefetched.
                No `download` attribute either - iOS would save it instead of offering the calendar. */}
            <a
              href={`${calendarPath}?session=${single.session.id}`}
              className={`${buttonVariants({ size: "lg" })} h-12 w-full gap-2 rounded-full text-base font-bold shadow-lg`}
            >
              <CalendarPlus data-icon="inline-start" />
              Add to calendar
            </a>
          </div>
        )
      ) : canAct && dialog(false)}
    </>
  );
}

function SubmissionBody({ entry: { form: f, state, mine, group }, slug, token, writing, people, selfId }: {
  entry: SubmissionEntry;
  slug: string;
  token: string;
  writing: boolean;
  people: Record<string, { name: string; movedTo: string | null }>;
  selfId: string;
}) {
  const dates = f.starts_on ? dayRange([f.starts_on, f.ends_on ?? f.starts_on]) : null;
  return (
    <>
      <InfoRows rows={[{ icon: CalendarDays, text: dates }, { icon: MapPin, text: f.venue }, { icon: Users, text: forGroups(f) }]} />
      <RichSections html={f.description} />
      <section className={block}>
        {/* D369: members mode is per-person, so it shows the person's own history like "off". */}
        {!isGroupForm(f.group_mode) && (
          <>
            {(state.reason === "limit" || state.reason === "today") && <Done today={state.reason === "today"} />}
            <SubmissionHistory submissions={mine} questions={f.questions} />
          </>
        )}
        {/* D352: an ineligible viewer gets the plain note below, not the group block - it names */}
        {/* a group they aren't measured against. */}
        {isGroupForm(f.group_mode) && state.reason !== "ineligible" && (
          <>
            {/* D353: at most one banner - the group being done trumps any per-person reason. */}
            {group?.done ? (
              <GroupDone text="Your group is done" />
            ) : state.reason === "limit" && group ? (
              <GroupDone text={`You've submitted — waiting on ${group.need - group.have} other${group.need - group.have === 1 ? "" : "s"}`} />
            ) : null}
            {group && <GroupStatus form={f} group={group} people={people} selfId={selfId} />}
            {state.reason === "nogroup" && <p className={note}>You need to be in a group to submit this.</p>}
          </>
        )}
        {f.group_mode === "members" && state.reason === "nogroup" && <p className={`mt-3 ${note}`}>You need to be in a team to submit this.</p>}
        {state.reason === "closed" && <p className={`mt-3 ${note}`}>Submissions for this are closed.</p>}
        {state.reason === "ineligible" && <p className={`mt-3 ${note}`}>This is not open to your group.</p>}
      </section>
      {state.can && (
        <ActivityActionDialog key={group ? group.entries.length : mine.length} label={submitLabel(f)} title={f.name} defaultOpen={writing}>
          <form action={submitAnswersAction.bind(null, slug, token, f.id)} className="flex flex-col gap-6">
            {f.questions.length > 0 && <SubmissionFields questions={f.questions} />}
            <SubmitButton className="h-12 w-full text-base font-bold">Submit</SubmitButton>
          </form>
        </ActivityActionDialog>
      )}
    </>
  );
}

/**
 * D374/D385: a scored challenge's page, in three tabs under the name. My stats - the week strip,
 * ring, the day's workouts and "Add a new entry" - is the default, since it is what the attendee
 * opens this page for every day, with My team at its foot (D387); Info holds the About and rules;
 * Leaderboard the standings (D386). Each tab reads only what it draws.
 */
function TrackerBody({ entry, slug, token, attendeeId, teamId, eventStartsOn, day, writing, tab }: {
  entry: SubmissionEntry; slug: string; token: string; attendeeId: string; teamId: string | null; eventStartsOn: string | null;
  day: string | null; writing: boolean; tab: TrackerTab;
}) {
  const path = `/e/${slug}/a/${token}/activities/${entry.form.id}`;
  return (
    // `?tab=` changes no route segment, so no loading.tsx sees it; the scope moves the underline
    // at once and swaps the tab for a skeleton until it arrives, as the Info page does (D206).
    <PendingScope>
      <TrackerTabs path={path} tab={tab} />
      <PendingSwap fallback={<Skeleton className="mt-5 h-40 rounded-[14px]" />}>
        {tab === "info"
          ? <TrackerInfo html={entry.form.description} />
          : tab === "leaderboard"
            ? <TrackerLeaderboard entry={entry} teamId={teamId} eventStartsOn={eventStartsOn} />
            : <TrackerStats entry={entry} slug={slug} token={token} path={path} attendeeId={attendeeId} teamId={teamId} eventStartsOn={eventStartsOn} day={day} writing={writing} />}
      </PendingSwap>
    </PendingScope>
  );
}

/** D385: the About and rules. The tab bar is the rule above them, so the first block drops its own. */
function TrackerInfo({ html }: { html: string | null }) {
  return (
    <div className="[&>div>section:first-child]:border-t-0">
      {html?.trim() ? <RichSections html={html} /> : <p className={`pt-5 ${note}`}>Details will be added soon.</p>}
    </div>
  );
}

/**
 * D374/D385: the attendee's own days - and the only tab with "Add a new entry". D387: My team
 * sits at its foot, closed, and follows the day picked in the week strip (`t.selected`, already
 * held inside the challenge's dates) and that day's week. The team's scores are only read for
 * someone who has a team.
 */
async function TrackerStats({ entry: { form: f, state }, slug, token, path, attendeeId, teamId, eventStartsOn, day, writing }: {
  entry: SubmissionEntry; slug: string; token: string; path: string; attendeeId: string; teamId: string | null;
  eventStartsOn: string | null; day: string | null; writing: boolean;
}) {
  const scoring = f.scoring!;
  const today = nowInKL().date;
  const [all, challenge] = await Promise.all([
    entriesForAttendee(f.id, attendeeId),
    teamId ? loadChallenge({ id: f.event_id, starts_on: eventStartsOn }, f, today) : Promise.resolve(null),
  ]);
  const t = buildTracker({ scoring, eventStartsOn, entries: all, today, requested: day });
  const workouts = t ? t.entries.filter((e) => e.status === "submitted").length : 0;
  const myTeam = challenge && teamId ? challenge.teams.find((x) => x.id === teamId) ?? null : null;
  const shownWeek = t && challenge ? challenge.score.weeks.find((w) => w.week.number === t.week.number) : undefined;
  return (
    <>
      <section className="flex flex-col gap-4 py-5">
        {t ? (
          <>
            {/* No `tab` param on a day's link: a day belongs to My stats, the tab without one. */}
            <WeekStrip t={t} href={(d) => (d === today ? path : `${path}?day=${d}`)} />
            <DayRing t={t} />
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-extrabold">{t.isToday ? "Today's entries" : "Entries"}</h2>
              <span className="text-xs text-muted-foreground">{workouts} workout{workouts === 1 ? "" : "s"}</span>
            </div>
            <EntryTimeline entries={t.entries} questions={f.questions} metricKey={scoring.metric_key}
              empty={t.isToday ? "Nothing logged yet today." : "Nothing logged this day."} />
            {challenge && myTeam && shownWeek?.teams[myTeam.id] && (
              <MyTeam team={myTeam} week={shownWeek.teams[myTeam.id]} weekInfo={shownWeek.week} score={challenge.score} scoring={scoring}
                day={t.selected} today={today} selfId={attendeeId} names={challenge.names} />
            )}
          </>
        ) : (
          <p className={note}>This challenge has no days set yet.</p>
        )}
        {state.reason === "nogroup" && <p className={note}>You&apos;re not in a team for this challenge.</p>}
        {state.reason === "ineligible" && <p className={note}>This is not open to your group.</p>}
        {state.reason === "closed" && (
          <p className={note}>
            {today < scoring.starts_on ? "The challenge hasn't started yet." : today > scoring.ends_on ? "The challenge has ended." : "Entries for this are closed."}
          </p>
        )}
      </section>
      {state.can && (
        // Keyed by every entry, not the shown day's: a submit redirects to today, so the key
        // changes only when an entry was added, and a refusal leaves the dialog open (D374).
        <ActivityActionDialog key={all.length} label="Add a new entry" title={f.name} defaultOpen={writing}
          description={t && !t.isToday ? "This entry counts for today." : undefined}>
          <form action={submitAnswersAction.bind(null, slug, token, f.id)} className="flex flex-col gap-6">
            {f.questions.length > 0 && <SubmissionFields questions={f.questions} />}
            <SubmitButton className="h-12 w-full text-base font-bold">Submit</SubmitButton>
          </form>
        </ActivityActionDialog>
      )}
    </>
  );
}

/** D386: every team's standing - the podium, where you stand, and the rest. My team is on My stats (D387). */
async function TrackerLeaderboard({ entry: { form: f }, teamId, eventStartsOn }: {
  entry: SubmissionEntry; teamId: string | null; eventStartsOn: string | null;
}) {
  const scoring = f.scoring!;
  const today = nowInKL().date;
  const challenge = await loadChallenge({ id: f.event_id, starts_on: eventStartsOn }, f, today);
  const standings = challenge.score.standings;
  return (
    <section className="flex flex-col gap-4 py-5">
      <Leaderboard standings={standings} mine={teamId}
        stand={standingLine(standings, teamId, { startsOn: scoring.starts_on, today })}
        podiumPoints={(scoring.podium ?? []).some((p) => p > 0)} />
    </section>
  );
}

/**
 * A Booth Passport's body. No dialog and no button: the attendee does nothing here — a booth
 * scans their badge (D90). The page is the card, and the wayfinding the card gives (D102).
 */
function PassportBody({ entry: { activity, passport }, attendeeName }: { entry: PassportEntry; attendeeName: string }) {
  const n = passport.cells.length;
  return (
    <>
      <InfoRows rows={[
        { icon: MapPin, text: n ? `${n} booth${n === 1 ? "" : "s"} to visit` : null },
        { icon: Users, text: forGroups(activity) },
      ]} />
      <RichSections html={activity.description} />
      <section className={`${block} flex flex-col gap-3`}>
        {!activity.is_open && !passport.complete && (
          <p className={note}>Stamping opens soon. The booths are below, so you know where to go.</p>
        )}
        <PassportGrid passport={passport} message={activity.reward_message} attendeeName={attendeeName} title={null} />
      </section>
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

/** A group form's version of Done (D353): the group's news, in one line. */
function GroupDone({ text }: { text: string }) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-success/30 bg-success-soft px-4 py-3 font-bold text-success-strong">
      <CircleCheck aria-hidden className="size-5 shrink-0" />{text}
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
