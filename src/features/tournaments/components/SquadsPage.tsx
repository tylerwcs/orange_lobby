import type { Activity } from "@/lib/types";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { alsoIn, namesLine, notInAnySport, sizeLabel, squadMembers, type SquadRow, type TournamentSport } from "../lib/squads";
import { addSquadMemberAction, pickSquadMemberAction, removeSquadMemberAction } from "../actions";
import { AddMemberSelect } from "./AddMemberSelect";
import { ChipRemoveButton } from "./FormButtons";

type Member = { id: string; name: string };

/**
 * A tournament's portal page (D644, D645): the group's squads for every sport, one compact card
 * each, so the whole group shows at a glance. A picker fills them - ✕ on a name, Add a member
 * underneath - and is told who in the group plays nothing yet.
 * Under Members join themselves, anyone else gets Join / Leave. From the deadline on, it is
 * read-only for everyone.
 */
export function SquadsPage({ activity, groupId, groupName, sports, rows, members, names, selfId, picker, locked, deadline, captainName, slug, token }: {
  activity: Activity;
  groupId: string;
  groupName: string;
  sports: TournamentSport[];
  /** Counted rows (D643). */
  rows: SquadRow[];
  /** The group's members this tournament is for, in the group's order: who can be picked. */
  members: Member[];
  /** Every group member's name, so a player the categories now leave out is still named. */
  names: Map<string, string>;
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
  const name = names;
  const squad = (sportId: string) => squadMembers(rows, sportId, groupId);
  const mine = sports.filter((s) => squad(s.id).includes(selfId));
  const lockWords = deadline ? ` They lock ${deadline}.` : "";
  const idle = notInAnySport(members.map((m) => m.id), rows).map((id) => name.get(id) ?? "");
  const pick = (sportId: string) => pickSquadMemberAction.bind(null, slug, token, activity.id, sportId);
  const remove = (sportId: string, id: string) => removeSquadMemberAction.bind(null, slug, token, activity.id, sportId, id);
  const add = (sportId: string) => addSquadMemberAction.bind(null, slug, token, activity.id, sportId);

  const lead = locked
    ? "Squads are locked. Ask the organisers for changes."
    : picker
      ? `You pick your group's squads.${lockWords}`
      : selfMode
        ? `Join the sports you want to play.${deadline ? ` Squads lock ${deadline}.` : ""}`
        : `${captainName ? `Your captain ${captainName} picks` : "Your group's captain picks"} the squads.${lockWords}`;

  const pill = (n: number, sp: TournamentSport) =>
    n > sp.max_size ? "bg-destructive/10 text-destructive" : n >= sp.min_size ? "bg-success-soft text-success-strong" : "bg-warning-soft text-warning";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{groupName}</p>
        <p className="text-sm">{lead}</p>
      </div>

      {picker && !locked && idle.length > 0 ? (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          {idle.length} member{idle.length === 1 ? " isn't" : "s aren't"} in any sport yet: {namesLine(idle)}.
        </p>
      ) : (
        <p className={`rounded-xl px-4 py-3 text-sm font-semibold ${mine.length ? "bg-success-soft text-success-strong" : "bg-muted text-muted-foreground"}`}>
          {mine.length ? `You're playing ${namesLine(mine.map((s) => s.name))}.` : "You're not in any sport yet."}
        </p>
      )}

      {sports.length === 0 && <p className="text-sm text-muted-foreground">The organisers haven&apos;t added any sports yet.</p>}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sports.map((s) => {
          const ids = squad(s.id);
          const inIt = ids.includes(selfId);
          const room = ids.length < s.max_size;
          const canEdit = picker && !locked;
          const options = members.filter((m) => !ids.includes(m.id)).map((m) => ({ id: m.id, name: m.name, alsoIn: alsoIn(m.id, rows, sports, s.id) }));
          return (
            <li key={s.id} className="flex flex-col gap-2.5 rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-extrabold">{s.name}</h2>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${pill(ids.length, s)}`}>{locked && ids.length < s.min_size ? `Forfeit · ${sizeLabel(ids.length, s)}` : sizeLabel(ids.length, s)}</span>
              </div>
              {ids.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5" aria-label={`${s.name} squad`}>
                  {ids.map((id) => {
                    const you = id === selfId;
                    return (
                      <li key={id} className={`inline-flex items-center gap-0.5 rounded-full py-1 pl-2.5 text-sm ${canEdit ? "pr-1" : "pr-2.5"} ${you ? "bg-primary/10 font-bold text-primary" : "bg-muted"}`}>
                        {you ? "You" : name.get(id) ?? "A former member"}
                        {canEdit && (
                          <form action={remove(s.id, id)} className="inline-flex">
                            <ChipRemoveButton label={`Remove ${you ? "yourself" : name.get(id)} from ${s.name}`} />
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nobody yet.</p>
              )}
              {canEdit && room && options.length > 0 && (
                // Keyed by who is in the squad, so an add (which redirects back here) resets the dropdown.
                <AddMemberSelect key={`${s.id}:${ids.join(",")}`} sport={s.name} options={options} add={add(s.id)} />
              )}
              {!locked && !picker && selfMode && (inIt || room) && (
                <form action={inIt ? remove(s.id, selfId) : pick(s.id).bind(null, selfId)}>
                  <SubmitButton size="sm" variant={inIt ? "outline" : "default"} className="w-full">{inIt ? "Leave" : "Join"}</SubmitButton>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
