import { eventFields } from "@/lib/attendee-fields";
import { formKey } from "@/lib/form-key";
import { SubmissionSetupFields } from "../../admin/ActivityRows";
import { ActivityMenu } from "../../admin/ActivityMenu";
import { removeWarning } from "../../row";
import { activityTabs, resolveTab, activityHref, type ActivityTab } from "../../tabs";
import { ActivityTabs } from "../../admin/ActivityTabs";
import { SubmissionTable } from "./SubmissionTable";
import { MissingPanel } from "./MissingPanel";
import { GroupsNotDonePanel } from "./GroupsNotDonePanel";
import { ParticipationPanel } from "./ParticipationPanel";
import { LeaderboardPanel } from "./scoring/LeaderboardPanel";
import { TeamGrid } from "./scoring/TeamGrid";
import { OpenSwitch } from "@/components/admin/OpenSwitch";
import { submissionsForActivity } from "../../db/activities";
import { listAttendees, listCategories } from "@/lib/db/attendees";
import { scannerNames } from "@/lib/db/users";
import { capSummary, missingFrom, participation, liveSubmissions, isGroupForm } from "../../lib/submissions";
import { nowInKL, dayNav } from "@/lib/time";
import { shortDate } from "@/lib/text";
import { loadChallenge } from "../../lib/challenge-data";
import { gridWeek } from "../../lib/challenge";
import { groupsNotDone } from "@/lib/groups";
import { listGroups } from "@/lib/db/groups";
import { categoryMatches } from "@/lib/agenda";
import { type Activity, type Event } from "@/lib/types";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { DayNav } from "@/components/admin/DayNav";
import { SaveBar } from "@/components/admin/SaveBar";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toggleOpenAction, togglePinAction, toggleLeaderboardAction, saveSubmissionActivityAction, deleteSubmissionActivityAction, uploadActivityImageAction, editSubmissionAction, revokeSubmissionAction, disqualifyAction, undoDisqualifyAction } from "../../admin/actions";

export async function SubmissionDetail({ ev, activity, requestedDay, tab, week, teamId }: {
  ev: Event; activity: Activity; requestedDay?: string; tab?: string; week?: string; teamId?: string;
}) {
  const [submissions, attendees, categories, groups] = await Promise.all([
    submissionsForActivity(activity.id), listAttendees(ev.id), listCategories(ev.id), listGroups(ev.id),
  ]);
  const attendeeById = new Map(attendees.map((a) => [a.id, a]));
  const submitterFor = (attendeeId: string) => {
    const a = attendeeById.get(attendeeId);
    return { name: a?.name ?? "Unknown", email: a?.email ?? null, category: a?.category ?? null };
  };

  // A revoked row stays for the record (D340, so SubmissionTable below still gets `submissions`
  // whole) but never counts toward anything this activity decides from (D339).
  const live = liveSubmissions(submissions);
  // Who edited or revoked a row, for its badge's title. Only the ids actually stamped.
  const adminNames = await scannerNames(submissions.flatMap((s) => [s.edited_by, s.revoked_by]));

  // D359/D360: a group form is chased by group, and its rows carry the group they were sent for.
  const grouped = isGroupForm(activity.group_mode);
  // D369: a members-mode entry carries its team, so the table shows it, but chasing stays per person.
  const teamed = activity.group_mode !== "off";
  // D373: a scored challenge is chased day by day, like a per-day form, and only among team members.
  const daily = activity.per_day || activity.scoring !== null;
  const chased = activity.group_mode === "members" ? attendees.filter((a) => a.group_id) : attendees;
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const bySubmission = [...submissions].sort((a, b) =>
    (groupName.get(a.group_id ?? "") ?? "￿").localeCompare(groupName.get(b.group_id ?? "") ?? "￿"));
  // F2: groupsNotDone is also what the export's missing sheet reads, so the two can't disagree
  // on which groups a form is still chasing. GroupsNotDonePanel wants `id`, not `groupId`.
  const notDone = grouped
    ? groupsNotDone(activity, groups, attendees, live).map((g) => ({ id: g.groupId, name: g.name, summary: g.summary, waitingOn: g.waitingOn }))
    : [];
  const ungrouped = grouped ? attendees.filter((a) => !a.group_id && categoryMatches(activity.categories, a.category)).length : 0;

  // Which question the chasing list is answering, decided HERE rather than inside
  // `missingFrom`, so the rule is visible where somebody reads the page (D175): a per-day
  // activity asks about one day, anything else asks whether they ever submitted at all.
  const today = nowInKL().date;
  const day = daily ? (requestedDay || today) : null;
  const missing = missingFrom(activity, live, chased.map((a) => a.id), (aid) => attendeeById.get(aid)?.category ?? null, day)
    .map((aid) => {
      const a = attendeeById.get(aid)!;
      return { id: a.id, name: a.name, category: a.category };
    });

  // Only a per-day activity has a pattern over time worth drawing: on a once-only activity
  // every row would be a single mark, which is a fact the submissions table already carries.
  const PARTICIPATION_DAYS = 14;
  const drifting = daily
    ? participation(activity, live, chased.map((a) => a.id), (aid) => attendeeById.get(aid)?.category ?? null, today, PARTICIPATION_DAYS)
        .map((r) => {
          const a = attendeeById.get(r.attendeeId)!;
          return { ...r, name: a.name, category: a.category };
        })
    : null;

  // D381: a scored challenge has a committee Leaderboard tab.
  const scored = activity.scoring !== null;
  // D383: a scored challenge's Submissions tab is the committee's audit, one day at a time - a
  // whole challenge is thousands of rows, each with a photo to sign. The tab's count and the
  // subtitle still count every live row; any other activity keeps its whole table.
  const shownDay = scored ? dayNav(requestedDay, today) : null;
  const tableRows = (grouped ? bySubmission : submissions).filter((s) => !shownDay || s.submitted_on === shownDay.day);
  const dayLive = liveSubmissions(tableRows).length;
  const dayRevoked = tableRows.length - dayLive;
  const tabs = activityTabs("submission", { submissions: live.length, notSubmitted: grouped ? notDone.length : missing.length, perDay: daily, grouped, scored });
  const current = resolveTab(tabs, tab);
  // Scored from the same read the portal and the export use (D375), and only when its tab is open.
  const challenge = current === "leaderboard" && scored ? await loadChallenge(ev, activity, today) : null;
  // A hand-edited ?week= that is not a number reads as every week.
  const weekNum = week && /^\d+$/.test(week) ? Number(week) : null;
  const gridTeam = challenge && teamId ? challenge.teams.find((x) => x.id === teamId) : undefined;
  const gridWeekShown = challenge && gridTeam ? gridWeek(challenge.weeks, weekNum, today) : undefined;
  const href = (t: ActivityTab) => activityHref(ev.id, activity.id, t);

  return (
    <div className="flex flex-col gap-4" data-wide>
      <AdminHeader
        title={activity.name}
        subtitle={`${live.length} submission${live.length === 1 ? "" : "s"} · ${capSummary(activity)}`}
        actions={
          <>
            <OpenSwitch open={activity.is_open} action={toggleOpenAction.bind(null, ev.id, activity.id, current)} name={activity.name} showLabel />
            <ActivityMenu
              name={activity.name}
              pinned={activity.pinned}
              togglePin={togglePinAction.bind(null, ev.id, activity.id, current)}
              settingsHref={href("setup")}
              exportHref={`/admin/events/${ev.id}/export/submissions.xlsx`}
              remove={deleteSubmissionActivityAction.bind(null, ev.id, activity.id)}
              removeMessage={removeWarning({ kind: "submission", submissions: submissions.length })}
            />
          </>
        }
      />
      <ActivityTabs tabs={tabs} current={current} href={href} />

      {/* Its settings live here, as every other kind's do, rather than in a modal on the list. */}
      {current === "setup" && (
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Details, rules and questions</CardTitle></CardHeader>
          <CardContent>
            <form key={formKey({ ...activity, is_open: undefined })} action={saveSubmissionActivityAction.bind(null, ev.id, activity.id)} className="grid grid-cols-1 gap-4">
              <SubmissionSetupFields activity={activity} categories={categories} fields={eventFields(ev.registration_questions, ev.attendee_fields)} uploadImage={uploadActivityImageAction.bind(null, ev.id)} />
              <SaveBar inCard />
            </form>
          </CardContent>
        </Card>
      )}

      {current === "submissions" && (
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Submissions</CardTitle></CardHeader>
          <CardContent className="px-0">
            {shownDay && (
              <div className="flex flex-col gap-3 px-(--card-spacing) pb-4">
                <DayNav day={shownDay.day} today={today} prev={shownDay.prev} next={shownDay.next}
                  basePath={`/admin/events/${ev.id}/activities/${activity.id}`} tab="submissions" />
                <p className="text-sm text-muted-foreground">
                  {dayLive} submission{dayLive === 1 ? "" : "s"} on {shortDate(shownDay.day)}{dayRevoked > 0 ? ` · ${dayRevoked} revoked` : ""}.
                </p>
              </div>
            )}
            <SubmissionTable
              submissions={tableRows}
              questions={activity.questions}
              submitterFor={submitterFor}
              edit={editSubmissionAction.bind(null, ev.id, activity.id)}
              revoke={revokeSubmissionAction.bind(null, ev.id, activity.id)}
              adminNames={adminNames}
              groupFor={teamed ? (s) => (s.group_id ? groupName.get(s.group_id) ?? "Deleted group" : "Deleted group") : undefined}
            />
          </CardContent>
        </Card>
      )}

      {current === "not-submitted" && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{grouped ? `Not done · ${notDone.length}` : `Not submitted · ${missing.length}`}</CardTitle>
          </CardHeader>
          <CardContent>
            {grouped ? (
              <GroupsNotDonePanel groups={notDone} ungrouped={ungrouped} />
            ) : (
              <MissingPanel
                people={missing}
                day={day}
                today={today}
                basePath={`/admin/events/${ev.id}/activities/${activity.id}`}
                tab="not-submitted"
              />
            )}
          </CardContent>
        </Card>
      )}

      {current === "participation" && drifting && (
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Participation</CardTitle></CardHeader>
          <CardContent>
            <ParticipationPanel people={drifting} windowDays={PARTICIPATION_DAYS} today={today} />
          </CardContent>
        </Card>
      )}

      {current === "leaderboard" && challenge && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Leaderboard</CardTitle>
            {/* D397: whether attendees get the Leaderboard tab. This one is the committee's, always. */}
            <CardAction>
              <OpenSwitch open={activity.show_leaderboard} action={toggleLeaderboardAction.bind(null, ev.id, activity.id)}
                name="the leaderboard to attendees" verb="Show" showLabel states={["Shown to attendees", "Hidden from attendees"]} />
            </CardAction>
          </CardHeader>
          <CardContent>
            {gridTeam && gridWeekShown ? (
              <TeamGrid
                team={gridTeam} week={gridWeekShown}
                score={challenge.score} names={challenge.names} dq={challenge.disqualifications}
                dailyMin={activity.scoring!.daily_min}
                back={activityHref(ev.id, activity.id, "leaderboard", week ? { week } : {})}
                disqualify={(aid) => disqualifyAction.bind(null, ev.id, activity.id, aid)}
                undo={(aid) => undoDisqualifyAction.bind(null, ev.id, activity.id, aid)}
              />
            ) : (
              <LeaderboardPanel score={challenge.score} week={weekNum} today={today}
                href={(extra) => activityHref(ev.id, activity.id, "leaderboard", extra)} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
