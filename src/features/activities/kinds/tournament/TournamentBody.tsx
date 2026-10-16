import { RichSections } from "@/components/portal/RichSections";
import { getGroup, groupMembers } from "@/lib/db/groups";
import { isYes } from "@/lib/groups";
import { fieldValue } from "@/lib/attendee-values";
import { isLocked, portalSquadPeople, SquadsPage } from "@/features/tournaments";
import type { TournamentEntry } from "../../lib/portal-activity-entries";
import { opensLabel } from "../../lib/schedule";

/**
 * A tournament in the portal (D644, D645): the organiser's words, then the group's squads. The
 * captain named is the first member holding the first ticked field, as My group orders them (D366).
 */
export async function TournamentBody({ entry: { activity, sports, rows, attendeeId, groupId, picker }, slug, token }: { entry: TournamentEntry; slug: string; token: string }) {
  const [group, everyone] = await Promise.all([getGroup(activity.event_id, groupId), groupMembers(activity.event_id, groupId)]);
  const { names, members } = portalSquadPeople(everyone, activity.categories);
  const captain = activity.proxy_fields.map((k) => everyone.find((m) => isYes(fieldValue(m, k)))).find(Boolean) ?? null;
  return (
    <div className="flex flex-col gap-6">
      <RichSections html={activity.description} />
      <SquadsPage
        activity={activity} groupId={groupId} groupName={group?.name ?? "Your group"} sports={sports} rows={rows}
        members={members} names={names} selfId={attendeeId} picker={picker}
        locked={isLocked(activity.squads_close_at, new Date())}
        deadline={activity.squads_close_at ? opensLabel(activity.squads_close_at) : null}
        captainName={captain?.name ?? null} slug={slug} token={token}
      />
    </div>
  );
}
