import type { Activity } from "@/lib/types";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { alsoIn, namesLine, notInAnySport, sizeLabel, squadMembers, type SquadRow, type TournamentSport } from "../lib/squads";
import { pickSquadMemberAction, removeSquadMemberAction } from "../actions";
import { MemberPicker } from "./MemberPicker";
import { RemoveButton } from "./FormButtons";

type Member = { id: string; name: string };

/**
 * A tournament's portal page (D644, D645): the group's squads for every sport. A picker fills
 * them - remove with ✕, add with Pick a member - and is told who in the group plays nothing yet.
 * Under Members join themselves, anyone else gets Join / Leave. From the deadline on, it is
 * read-only for everyone.
 */
export function SquadsPage({ activity, groupId, groupName, sports, rows, members, selfId, picker, locked, deadline, captainName, slug, token }: {
  activity: Activity;
  groupId: string;
  groupName: string;
  sports: TournamentSport[];
  /** Counted rows (D643). */
  rows: SquadRow[];
  /** The group's members this tournament is for, in the group's order. */
  members: Member[];
  selfId: string;
  picker: boolean;
  locked: boolean;
  /** When squads lock, as words ("Fri 24 Oct, 6:00pm"), or null with no deadline. */
  deadline: string | null;
  captainName: string | null;
  slug: string;
  token: string;
}) {
  const selfMode = activity.squad_fill === "self";
  const name = new Map(members.map((m) => [m.id, m.name]));
  const squad = (sportId: string) => squadMembers(rows, sportId, groupId);
  const mine = sports.filter((s) => squad(s.id).includes(selfId));
  const lockWords = deadline ? ` They lock ${deadline}.` : "";
  const idle = notInAnySport(members.map((m) => m.id), rows).map((id) => name.get(id) ?? "");
  const pick = (sportId: string) => pickSquadMemberAction.bind(null, slug, token, activity.id, sportId);
  const remove = (sportId: string, id: string) => removeSquadMemberAction.bind(null, slug, token, activity.id, sportId, id);

  const lead = locked
    ? "Squads are locked. Ask the organisers for changes."
    : picker
      ? `You pick your group's squads.${lockWords}`
      : selfMode
        ? `Join the sports you want to play.${deadline ? ` Squads lock ${deadline}.` : ""}`
        : `${captainName ? `Your captain ${captainName} picks` : "Your group's captain picks"} the squads.${lockWords}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{groupName}</p>
        <p className="text-sm">{lead}</p>
      </div>

      <p className={`rounded-xl px-4 py-3 text-sm font-semibold ${mine.length ? "bg-success-soft text-success-strong" : "bg-muted text-muted-foreground"}`}>
        {mine.length ? `You're playing ${namesLine(mine.map((s) => s.name))}.` : "You're not in any sport yet."}
      </p>

      {picker && !locked && idle.length > 0 && (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          {idle.length} member{idle.length === 1 ? " isn't" : "s aren't"} in any sport yet: {namesLine(idle)}.
        </p>
      )}

      {sports.length === 0 && <p className="text-sm text-muted-foreground">The organisers haven&apos;t added any sports yet.</p>}

      <ul className="flex flex-col gap-3">
        {sports.map((s) => {
          const ids = squad(s.id);
          const inIt = ids.includes(selfId);
          const room = ids.length < s.max_size;
          return (
            <li key={s.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-extrabold">{s.name}</h2>
                <span className={`text-sm tabular-nums ${ids.length >= s.min_size && ids.length <= s.max_size ? "text-success-strong" : "text-warning"}`}>{sizeLabel(ids.length, s)}</span>
              </div>
              {ids.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {ids.map((id) => (
                    <li key={id} className="flex items-center justify-between gap-2 text-sm">
                      <span className={id === selfId ? "font-bold" : undefined}>{id === selfId ? "You" : name.get(id) ?? "A former member"}</span>
                      {picker && !locked && (
                        <form action={remove(s.id, id)}>
                          <RemoveButton label={`Remove ${id === selfId ? "yourself" : name.get(id)} from ${s.name}`} />
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nobody yet.</p>
              )}
              {/* Keyed by who is in the squad, so a pick or removal (which redirects back here) remounts it closed. */}
              {!locked && picker && room && (
                <MemberPicker key={`${s.id}:${ids.join(",")}`} sport={s.name} left={s.max_size - ids.length} pick={pick(s.id)}
                  members={members.map((m) => ({ id: m.id, name: m.name, alsoIn: alsoIn(m.id, rows, sports, s.id), inThis: ids.includes(m.id) }))} />
              )}
              {!locked && !picker && selfMode && (inIt || room) && (
                <form action={inIt ? remove(s.id, selfId) : pick(s.id).bind(null, selfId)}>
                  <SubmitButton variant={inIt ? "outline" : "default"} className="w-full">{inIt ? "Leave" : "Join"}</SubmitButton>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
