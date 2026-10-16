import { RichSections } from "@/components/portal/RichSections";
import { getGroup, groupMembers } from "@/lib/db/groups";
import { isYes } from "@/lib/groups";
import { fieldValue } from "@/lib/attendee-values";
import { isLocked, portalSquadPeople, ResultsPage, SquadsPage, type MatchFilter, type ResultsView } from "@/features/tournaments";
import type { TournamentEntry } from "../../lib/portal-activity-entries";
import { opensLabel } from "../../lib/schedule";

const VIEWS: ResultsView[] = ["matches", "standings", "playoffs", "squads"];
const SHOWS: MatchFilter[] = ["all", "mine", "left", "done"];

/**
 * A tournament in the portal: the organiser's words, then the group's squads (D644, D645) until
 * squads lock or a sport has its pools; from then on the results (D663), where each sport's
 * Squads tab is that sport's squad. The captain named is the first member holding the first
 * ticked field, as My group orders them (D366).
 */
export async function TournamentBody({ entry, slug, token, sport = null, view = null, show = null }: {
  entry: TournamentEntry; slug: string; token: string; sport?: string | null; view?: string | null; show?: string | null;
}) {
  const { activity, sports, rows, attendeeId, groupId, picker, results, groups } = entry;
  const [group, everyone] = await Promise.all([getGroup(activity.event_id, groupId), groupMembers(activity.event_id, groupId)]);
  const { names, members } = portalSquadPeople(everyone, activity.categories);
  const captain = activity.proxy_fields.map((k) => everyone.find((m) => isYes(fieldValue(m, k)))).find(Boolean) ?? null;
  const locked = isLocked(activity.squads_close_at, new Date());
  const squads = (only: typeof sports) => (
    <SquadsPage
      activity={activity} groupId={groupId} groupName={group?.name ?? "Your group"} sports={only} rows={rows}
      members={members} names={names} selfId={attendeeId} picker={picker} locked={locked}
      deadline={activity.squads_close_at ? opensLabel(activity.squads_close_at) : null}
      captainName={captain?.name ?? null} slug={slug} token={token}
    />
  );
  const started = locked || results.some((r) => r.pools.length > 0);
  return (
    <div className="flex flex-col gap-6">
      <RichSections html={activity.description} />
      {started ? (
        <ResultsPage
          activity={activity} results={results} groups={groups} groupId={groupId}
          sportId={sport} view={VIEWS.find((v) => v === view) ?? null} show={SHOWS.find((s) => s === show) ?? "all"}
          path={`/e/${slug}/a/${token}/activities/${activity.id}`}
          squads={(s) => squads(sports.filter((x) => x.id === s.id))}
        />
      ) : squads(sports)}
    </div>
  );
}
