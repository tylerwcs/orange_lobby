import Link from "next/link";
import { type SubmissionEntry, type SubmissionTrack } from "../../../lib/portal-activity-entries";
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
import { pts, standingLine } from "../../../lib/leaderboard";
import { allGroupCards, type GroupCard } from "@/lib/groups";
import type { AttendeeField } from "@/lib/attendee-fields";
import { entriesForAttendee } from "../../../db/activities";
import { RichSections } from "@/components/portal/RichSections";
import { PendingScope, PendingSwap } from "@/components/PendingNav";
import { Skeleton } from "@/components/ui/skeletons";
import { loadChallenge, loadPairScore } from "../../../lib/challenge-data";
import { unitOf } from "../../../lib/challenge";
import { note } from "../../../portal/detail-parts";
import { type Proxy, addedByLine, canAdd, SubmitForm, AddedForGroup } from "../SubmissionBody";
import { getActivity } from "../../../db/activities";
import { isTrackCaptain, sameCalendar, scorePair, setMyTeamTrackAction, trackRows, trackTeamRows, TrackTeam } from "@/features/tracks";
import type { Activity } from "@/lib/types";

/**
 * D374/D385: a scored challenge's page, in three tabs under the name. My stats - the week strip,
 * ring, the day's workouts and "Add a new entry" - is the default, since it is what the attendee
 * opens this page for every day, with My team at its foot (D387); Info holds the About and rules;
 * Leaderboard the standings (D386). Each tab reads only what it draws.
 */
export function TrackerBody({ entry, slug, token, attendeeId, teamId, eventStartsOn, day, writing, tab, edit, proxy, rosters, changingTracks = false }: {
  entry: SubmissionEntry; slug: string; token: string; attendeeId: string; teamId: string | null; eventStartsOn: string | null;
  day: string | null; writing: boolean; tab: TrackerTab; edit?: EditEntry; proxy: Proxy | null;
  /** D517: the event shows all groups, so the Leaderboard's teams open to their rosters; null keeps rows closed. */
  rosters: RosterRules | null;
  /** D724: `?tracks=change` - a captain's My team shows the A | B switch on every row, not just the unplaced. */
  changingTracks?: boolean;
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
            ? <TrackerLeaderboard entry={entry} teamId={teamId} attendeeId={attendeeId} eventStartsOn={eventStartsOn} rosters={rosters} />
            : <TrackerStats entry={entry} slug={slug} token={token} path={path} attendeeId={attendeeId} teamId={teamId} eventStartsOn={eventStartsOn} day={day} writing={writing} edit={edit} proxy={proxy} changingTracks={changingTracks} />}
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
async function TrackerStats({ entry: { form: f, state, track }, slug, token, path, attendeeId, teamId, eventStartsOn, day, writing, edit, proxy, changingTracks }: {
  entry: SubmissionEntry; slug: string; token: string; path: string; attendeeId: string; teamId: string | null;
  eventStartsOn: string | null; day: string | null; writing: boolean; edit?: EditEntry; proxy: Proxy | null; changingTracks: boolean;
}) {
  const scoring = f.scoring!;
  const unit = unitOf(scoring);
  const today = nowInKL().date;
  const [all, challenge] = await Promise.all([
    entriesForAttendee(f.id, attendeeId),
    teamId ? loadChallenge({ id: f.event_id, starts_on: eventStartsOn }, f, today) : Promise.resolve(null),
  ]);
  const t = buildTracker({ scoring, eventStartsOn, entries: all, today, requested: day });
  const myTeam = challenge && teamId ? challenge.teams.find((x) => x.id === teamId) ?? null : null;
  // D724: on a track pair, My team is the team by track, each person on their own track's number.
  const [addedBy, pairTeam] = await Promise.all([
    addedByLine(f.event_id, t?.entries ?? []),
    t && challenge && myTeam && track ? loadTrackTeam(f, track, challenge, { teamId: myTeam.id, selfId: attendeeId, day: t.selected, today, eventStartsOn, week: t.week.number }) : Promise.resolve(null),
  ]);
  const workouts = t ? t.entries.filter((e) => e.status === "submitted").length : 0;
  const shownWeek = t && challenge ? challenge.score.weeks.find((w) => w.week.number === t.week.number) : undefined;
  return (
    <>
      <section className="flex flex-col gap-4 py-5">
        {t ? (
          <>
            {/* No `tab` param on a day's link: a day belongs to My stats, the tab without one. */}
            <WeekStrip t={t} href={(d) => (d === today ? path : `${path}?day=${d}`)} />
            <DayRing t={t} unit={unit} />
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-extrabold">{t.isToday ? "Today's entries" : "Entries"}</h2>
              <span className="text-xs text-muted-foreground">{workouts} workout{workouts === 1 ? "" : "s"}</span>
            </div>
            <EntryTimeline entries={t.entries} questions={f.questions} metricKey={scoring.metric_key} unit={unit}
              empty={t.isToday ? "Nothing logged yet today." : "Nothing logged this day."} edit={edit} addedBy={addedBy} />
            {t.isToday && <AddedForGroup f={f} slug={slug} token={token} proxy={proxy} edit={edit} />}
            {track && <TrackNote track={track} href={`/e/${slug}/a/${token}/activities/${track.other.id}`} />}
            {pairTeam && myTeam && (
              <TrackTeam teamName={myTeam.name} groups={pairTeam.groups} pair={track!.pair} labels={pairTeam.labels} captain={pairTeam.captain} bonus={pairTeam.bonus}
                day={t.selected} today={today} startsOn={scoring.starts_on} changing={changingTracks}
                changeHref={`${path}?${new URLSearchParams({ ...(t.selected === today ? {} : { day: t.selected }), tracks: "change" })}`}
                doneHref={t.selected === today ? path : `${path}?day=${t.selected}`}
                switchAction={(id, s, shown) => setMyTeamTrackAction.bind(null, slug, token, f.id, id, s, shown, t.selected === today ? null : t.selected)} />
            )}
            {!pairTeam && challenge && myTeam && shownWeek?.teams[myTeam.id] && (
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

/**
 * D724: what My team needs on a track pair - the pair's placements, the other track's totals for
 * the shown day (this track's come from the score already read), both activities' names, and
 * whether this attendee is a captain of the pair.
 */
async function loadTrackTeam(f: Activity, track: SubmissionTrack, challenge: Awaited<ReturnType<typeof loadChallenge>>,
  at: { teamId: string; selfId: string; day: string; today: string; eventStartsOn: string | null; week: number }) {
  const { pair } = track;
  const [rows, other] = await Promise.all([trackRows(pair.id), getActivity(track.other.id, f.event_id)]);
  if (!other?.scoring) return null;
  const otherChallenge = await loadChallenge({ id: f.event_id, starts_on: at.eventStartsOn }, other, at.today);
  const members = challenge.attendees.filter((m) => m.group_id === at.teamId);
  const dayOf = (c: typeof challenge) => new Map(members.map((m) => [m.id, c.score.personKm(m.id, at.day)]));
  const isA = f.id === pair.a_activity_id;
  const [a, b] = isA ? [f, other] : [other, f];
  const [ca, cb] = isA ? [challenge, otherChallenge] : [otherChallenge, challenge];
  const self = challenge.attendees.find((m) => m.id === at.selfId);
  // D727: the +10 asks about both tracks, so it comes from the pair's score, for the week on show.
  const pairWeek = pair.bonus > 0 && sameCalendar(a.scoring!, b.scoring!)
    ? scorePair({ a: ca.score, b: cb.score, aScoring: a.scoring!, bScoring: b.scoring!, teams: challenge.teams, bonus: pair.bonus, today: at.today }).weeks.find((w) => w.week.number === at.week)
    : undefined;
  const days = pairWeek?.week.days ?? [];
  return {
    groups: trackTeamRows({ pair, members, rows, totals: { a: dayOf(ca), b: dayOf(cb) }, scoring: { a: a.scoring!, b: b.scoring! }, day: at.day, today: at.today, selfId: at.selfId }),
    labels: { a: a.name, b: b.name },
    captain: !!self && isTrackCaptain([a, b], self),
    bonus: pairWeek?.teams[at.teamId]
      ? { week: pairWeek.teams[at.teamId], points: pair.bonus, current: days[0] < at.today && at.today <= days[days.length - 1], past: days[days.length - 1] < at.today }
      : null,
  };
}

/** D724/D725: which track this attendee is on, above My team - and, off this track, where to submit instead of the Add button. */
function TrackNote({ track, href }: { track: SubmissionTrack; href: string }) {
  if (track.status === "none") return <p className={note}>Your captain hasn&apos;t put you on a track yet.</p>;
  if (track.status === "this") return <p className={note}>You&apos;re on {track.label} — this is your track.</p>;
  return (
    <p className={note}>
      You&apos;re on {track.other.label} — <Link href={href} className="font-bold underline underline-offset-2">submit under {track.other.name}</Link>.
    </p>
  );
}

/** D517: what the Leaderboard's rosters may show - the event's shared fields, of which only tags survive (D512). */
export type RosterRules = { groupFields: string[]; fields: AttendeeField[] };

/**
 * D386: every team's standing - the podium, where you stand, and the rest. My team is on My stats (D387).
 * D516/D517: with `rosters`, every team gets a row that opens to its members, built by the same rule
 * as All groups (names and tags only), from the rows the score was read from.
 */
async function TrackerLeaderboard({ entry: { form: f, track }, teamId, attendeeId, eventStartsOn, rosters }: {
  entry: SubmissionEntry; teamId: string | null; attendeeId: string; eventStartsOn: string | null; rosters: RosterRules | null;
}) {
  const scoring = f.scoring!;
  const today = nowInKL().date;
  const event = { id: f.event_id, starts_on: eventStartsOn };
  // D728: on a track pair the board is the team's one score, both tracks and the bonus.
  const paired = track ? await loadPairScore(event, track.pair, today) : null;
  if (paired && !paired.ok) return <p className={`py-5 ${note}`}>{paired.reason}</p>;
  const challenge = paired?.ok ? paired.a : await loadChallenge(event, f, today);
  const standings = paired?.ok ? paired.score.standings : challenge.score.standings;
  const byTeam = paired?.ok ? new Map(paired.score.standings.map((s) => [s.id, s])) : null;
  const breakdown = byTeam ? (id: string) => {
    const s = byTeam.get(id);
    return s ? `${pts(s.a)} Track A · ${pts(s.b)} Track B · ${pts(s.bonus)} bonus` : null;
  } : null;
  const members: Map<string, GroupCard["members"]> | null = rosters
    ? new Map(allGroupCards(challenge.groups, challenge.attendees, null, rosters.groupFields, rosters.fields).map((c) => [c.id, c.members]))
    : null;
  return (
    <section className="flex flex-col gap-4 py-5">
      <Leaderboard standings={standings} mine={teamId} rosters={members} selfId={attendeeId}
        stand={standingLine(standings, teamId, { startsOn: scoring.starts_on, today })}
        podiumPoints={(scoring.podium ?? []).some((p) => p > 0)} breakdown={breakdown} />
    </section>
  );
}
