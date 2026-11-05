import { cookies } from "next/headers";
import { RichSections } from "@/components/portal/RichSections";
import { groupMembers } from "@/lib/db/groups";
import { isYes } from "@/lib/groups";
import { fieldValue } from "@/lib/attendee-values";
import {
  isLocked, pickSport, portalSquadPeople, sideOfGroup, sportCookie, SquadsPage, TournamentPage, tournamentTab, type MatchFilter, type ResultsView,
} from "@/features/tournaments";
import type { TournamentEntry } from "../../lib/portal-activity-entries";
import { opensLabel } from "../../lib/schedule";

const VIEWS: ResultsView[] = ["matches", "standings", "playoffs"];
const SHOWS: MatchFilter[] = ["all", "mine", "left", "done"];

/**
 * A tournament in the portal (D663): About (the organiser's words), Squads (D644, D645), Results
 * and the Leaderboard, as tabs. Results opens on the sport in the link, else the one this phone
 * last picked, else the first. The captain named is the first member holding the first ticked
 * field, as My group orders them (D366). A super team's page holds both teams (D827), each with
 * its own captain named.
 */
export async function TournamentBody({ entry, slug, token, tab = null, sport = null, view = null, show = null }: {
  entry: TournamentEntry; slug: string; token: string; tab?: string | null; sport?: string | null; view?: string | null; show?: string | null;
}) {
  const { activity, sports, rows, attendeeId, groupId, sideId, sides, picker, results, groups, bonus } = entry;
  const side = sides ? sideOfGroup(sides, groupId) : null;
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const teams = (side?.groupIds ?? [groupId]).map((id) => ({ id, name: groupName.get(id) ?? "Your group" }));
  const [byTeam, jar] = await Promise.all([Promise.all(teams.map((t) => groupMembers(activity.event_id, t.id))), cookies()]);
  const everyone = byTeam.flat();
  const { names, members } = portalSquadPeople(everyone, activity.categories);
  const groupOf = new Map(everyone.map((m) => [m.id, m.group_id ?? groupId]));
  const captainNames = byTeam.flatMap((team) => {
    const captain = activity.proxy_fields.map((k) => team.find((m) => isYes(fieldValue(m, k)))).find(Boolean);
    return captain ? [captain.name] : [];
  });
  const locked = isLocked(activity.squads_close_at, new Date());
  const hasAbout = !!activity.description?.trim();
  const leaderboard = (activity.place_points?.length ?? 0) > 0 && activity.show_overall !== false;
  const remembered = jar.get(sportCookie(activity.id))?.value ?? null;
  return (
    <TournamentPage
      activity={activity} results={results} groups={groups} groupId={groupId} bonus={bonus}
      tab={tournamentTab({ tab, locked, leaderboard, about: hasAbout })}
      sportId={pickSport(sport, remembered, sports.map((s) => s.id))}
      view={VIEWS.find((v) => v === view) ?? null} show={SHOWS.find((s) => s === show) ?? "all"}
      path={`/e/${slug}/a/${token}/activities/${activity.id}`}
      about={hasAbout ? <RichSections html={activity.description} /> : null}
      squads={
        <SquadsPage
          activity={activity} sideId={sideId} title={side?.name ?? teams[0].name} teams={teams} sports={sports} rows={rows}
          members={members.map((m) => ({ ...m, groupId: groupOf.get(m.id) ?? groupId }))} names={names} selfId={attendeeId} picker={picker} locked={locked}
          deadline={activity.squads_close_at ? opensLabel(activity.squads_close_at) : null}
          captainNames={captainNames} slug={slug} token={token}
        />
      }
    />
  );
}
