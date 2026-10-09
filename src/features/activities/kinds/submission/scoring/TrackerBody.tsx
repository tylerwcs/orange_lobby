import { type SubmissionEntry } from "../../../lib/portal-activity-entries";
import { type EditEntry } from "../SubmissionHistory";
import { ActivityActionDialog } from "../../../portal/ActivityActionDialog";
import { WeekStrip } from "./tracker/WeekStrip";
import { DayRing } from "./tracker/DayRing";
import { EntryTimeline } from "./tracker/EntryTimeline";
import { MyTeam } from "./tracker/MyTeam";
import { Leaderboard } from "./tracker/Leaderboard";
import { TrackerTabs } from "./tracker/TrackerTabs";
import { nowInKL } from "@/lib/time";
import { buildTracker, trackerTabs, type TrackerTab } from "../../../lib/tracker";
import { standingLine } from "../../../lib/leaderboard";
import { entriesForAttendee } from "../../../db/activities";
import { RichSections } from "@/components/portal/RichSections";
import { PendingScope, PendingSwap } from "@/components/PendingNav";
import { Skeleton } from "@/components/ui/skeletons";
import { loadChallenge } from "../../../lib/challenge-data";
import { note } from "../../../portal/detail-parts";
import { type Proxy, addedByLine, canAdd, SubmitForm, AddedForGroup } from "../SubmissionBody";

/**
 * D374/D385: a scored challenge's page, in three tabs under the name. My stats - the week strip,
 * ring, the day's workouts and "Add a new entry" - is the default, since it is what the attendee
 * opens this page for every day, with My team at its foot (D387); Info holds the About and rules;
 * Leaderboard the standings (D386). Each tab reads only what it draws.
 */
export function TrackerBody({ entry, slug, token, attendeeId, teamId, eventStartsOn, day, writing, tab, edit, proxy }: {
  entry: SubmissionEntry; slug: string; token: string; attendeeId: string; teamId: string | null; eventStartsOn: string | null;
  day: string | null; writing: boolean; tab: TrackerTab; edit?: EditEntry; proxy: Proxy | null;
}) {
  const path = `/e/${slug}/a/${token}/activities/${entry.form.id}`;
  return (
    // `?tab=` changes no route segment, so no loading.tsx sees it; the scope moves the underline
    // at once and swaps the tab for a skeleton until it arrives, as the Info page does (D206).
    <PendingScope>
      <TrackerTabs path={path} tab={tab} tabs={trackerTabs(entry.form.show_leaderboard)} />
      <PendingSwap fallback={<Skeleton className="mt-5 h-40 rounded-[14px]" />}>
        {tab === "info"
          ? <TrackerInfo html={entry.form.description} />
          : tab === "leaderboard"
            ? <TrackerLeaderboard entry={entry} teamId={teamId} eventStartsOn={eventStartsOn} />
            : <TrackerStats entry={entry} slug={slug} token={token} path={path} attendeeId={attendeeId} teamId={teamId} eventStartsOn={eventStartsOn} day={day} writing={writing} edit={edit} proxy={proxy} />}
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
async function TrackerStats({ entry: { form: f, state }, slug, token, path, attendeeId, teamId, eventStartsOn, day, writing, edit, proxy }: {
  entry: SubmissionEntry; slug: string; token: string; path: string; attendeeId: string; teamId: string | null;
  eventStartsOn: string | null; day: string | null; writing: boolean; edit?: EditEntry; proxy: Proxy | null;
}) {
  const scoring = f.scoring!;
  const today = nowInKL().date;
  const [all, challenge] = await Promise.all([
    entriesForAttendee(f.id, attendeeId),
    teamId ? loadChallenge({ id: f.event_id, starts_on: eventStartsOn }, f, today) : Promise.resolve(null),
  ]);
  const t = buildTracker({ scoring, eventStartsOn, entries: all, today, requested: day });
  const addedBy = await addedByLine(f.event_id, t?.entries ?? []);
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
              empty={t.isToday ? "Nothing logged yet today." : "Nothing logged this day."} edit={edit} addedBy={addedBy} />
            {t.isToday && <AddedForGroup f={f} slug={slug} token={token} proxy={proxy} edit={edit} />}
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
      {canAdd(state, proxy) && (
        // Keyed by every entry, not the shown day's: a submit redirects to today, so the key
        // changes only when an entry was added, and a refusal leaves the dialog open (D374).
        // D392: entries sent for the group count too.
        <ActivityActionDialog key={`${all.length}:${proxy?.added.length ?? 0}`} label="Add a new entry" title={f.name} defaultOpen={writing}
          description={t && !t.isToday ? "This entry counts for today." : undefined}>
          <SubmitForm f={f} slug={slug} token={token} state={state} proxy={proxy} />
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
