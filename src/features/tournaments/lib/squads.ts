import { categoryMatches } from "@/lib/agenda";

/**
 * Squad rules and words (D642-D649). Pure, so the captain's page, the member's view, the admin
 * Squads tab and the export all count the same people and say the same thing about them.
 */

/** One of a tournament's sports (D638). Later layers hang their formats and matches off it (D651). */
export type TournamentSport = {
  id: string; activity_id: string; name: string; min_size: number; max_size: number; position: number;
  /** D653: scores (higher wins) or times (faster wins). */
  result_kind: "score" | "time";
  /** D653: pools then placing brackets, or matches the admin adds by hand (D665). */
  format: "pools" | "manual";
  pool_size: number;
  /** D660: when its short squads were marked forfeit; null until then. */
  forfeits_marked_at: string | null;
};

/** One squad place, as stored. Counts only while `countedRows` keeps it (D643). */
export type SquadRow = { sport_id: string; group_id: string; attendee_id: string; added_by: string | null; added_at: string };

/** What the rules need to know about a person in a squad row. */
export type SquadPerson = { id: string; name: string; group_id: string | null; cancelled_at: string | null };

export type SquadStateKey = "full" | "short" | "over" | "ready" | "forfeit";

/** What `add_squad_member` / `remove_squad_member` answer, apart from `ok`. */
export type SquadRefusal = "full" | "locked" | "not_allowed" | "not_member" | "already" | "missing" | "closed";

type Size = Pick<TournamentSport, "min_size" | "max_size">;

/**
 * D643: the rows that count - the person is still registered and still in the group the row is
 * for. A cancelled or moved person's row stays in the table and is ignored everywhere.
 */
export function countedRows(rows: SquadRow[], people: Map<string, SquadPerson>): SquadRow[] {
  return rows.filter((r) => {
    const p = people.get(r.attendee_id);
    return !!p && p.cancelled_at === null && p.group_id === r.group_id;
  });
}

/** One squad's attendee ids, in the order they were added. */
export function squadMembers(rows: SquadRow[], sportId: string, groupId: string): string[] {
  return rows
    .filter((r) => r.sport_id === sportId && r.group_id === groupId)
    .sort((a, b) => a.added_at.localeCompare(b.added_at))
    .map((r) => r.attendee_id);
}

const range = (s: Size) => (s.min_size === s.max_size ? `${s.min_size}` : `${s.min_size}–${s.max_size}`);

/** "1 of 2", "2 of 2 ✓", "5 of 5–7 ✓", or "Over · 1 too many". */
export function sizeLabel(count: number, s: Size): string {
  if (count > s.max_size) return `Over · ${count - s.max_size} too many`;
  return `${count} of ${range(s)}${count >= s.min_size ? " ✓" : ""}`;
}

/** D646: Full / Short / Over before the deadline; Ready / Forfeit / Over from it on. */
export function squadState(count: number, s: Size, locked: boolean): { key: SquadStateKey; label: string } {
  if (count > s.max_size) return { key: "over", label: sizeLabel(count, s) };
  if (count >= s.min_size) return locked ? { key: "ready", label: "Ready" } : { key: "full", label: "Full" };
  return locked ? { key: "forfeit", label: "Forfeit" } : { key: "short", label: `${s.min_size - count} short` };
}

/** D641: squads lock at the deadline itself. No deadline, no lock. */
export function isLocked(closeAt: string | null | undefined, now: Date): boolean {
  return !!closeAt && now.getTime() >= new Date(closeAt).getTime();
}

/** D644: the captain's reminder - members with no counted place in any sport. */
export function notInAnySport(memberIds: string[], rows: SquadRow[]): string[] {
  const playing = new Set(rows.map((r) => r.attendee_id));
  return memberIds.filter((id) => !playing.has(id));
}

/** The picker's hint: the other sports this person is already in, in the organiser's order. */
export function alsoIn(attendeeId: string, rows: SquadRow[], sports: TournamentSport[], exceptSportId: string): string[] {
  const theirs = new Set(rows.filter((r) => r.attendee_id === attendeeId && r.sport_id !== exceptSportId).map((r) => r.sport_id));
  return [...sports].sort((a, b) => a.position - b.position).filter((s) => theirs.has(s.id)).map((s) => s.name);
}

/** "A", "A and B", "A, B and C"; past `max` names, "… and 4 more". */
export function namesLine(names: string[], max = 10): string {
  if (names.length > max) return `${names.slice(0, max).join(", ")} … and ${names.length - max} more`;
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** How many of these groups are below the sport's minimum, from counted rows. */
export function shortCount(sport: TournamentSport, groupIds: string[], rows: SquadRow[]): number {
  return groupIds.filter((g) => squadMembers(rows, sport.id, g).length < sport.min_size).length;
}

/** How many of these groups are above the sport's maximum: not ready either, and the list says so. */
export function overCount(sport: TournamentSport, groupIds: string[], rows: SquadRow[]): number {
  return groupIds.filter((g) => squadMembers(rows, sport.id, g).length > sport.max_size).length;
}

/**
 * The portal page's people: every group member's name, so a player outside the tournament's
 * categories (it changed after they were picked) is still named, and the members it offers.
 */
export function portalSquadPeople<T extends { id: string; name: string; category: string | null }>(
  everyone: T[],
  categories: string[] | null,
): { names: Map<string, string>; members: { id: string; name: string }[] } {
  return {
    names: new Map(everyone.map((m) => [m.id, m.name])),
    members: everyone.filter((m) => categoryMatches(categories, m.category)).map((m) => ({ id: m.id, name: m.name })),
  };
}

/** A name for a flash, only for this event's own attendee; anyone else is "They". */
export function nameInEvent(attendee: { name: string; event_id: string } | null, eventId: string): string {
  return attendee && attendee.event_id === eventId ? attendee.name : "They";
}

/** D642: each refusal as the flash to show. */
export function refusalFlash(code: SquadRefusal, ctx: { sport: string; name?: string }): string {
  switch (code) {
    case "full": return `${ctx.sport} is full.`;
    case "locked": return "Squads are locked. Ask the organisers to make changes.";
    case "not_allowed": return "Only your captain can change squads.";
    case "not_member": return "They're not in your group.";
    case "already": return `${ctx.name ?? "They"} ${ctx.name ? "is" : "are"} already in ${ctx.sport}.`;
    case "missing": return "That squad no longer exists.";
    case "closed": return "This tournament is closed.";
    default: {
      const exhaustive: never = code;
      throw new Error(`Unhandled squad refusal: ${String(exhaustive)}`);
    }
  }
}

/** One line of the squads sheet (D649). A null attendee is the blank row a short squad gets. */
export type SquadExportRow = { sport: string; group: string; attendeeId: string | null; state: "" | "Short" | "Forfeit" };

/** D649: sport order, then group name, then player name; a short squad ends with a blank Short/Forfeit row. */
export function squadExportRows(input: {
  sports: TournamentSport[];
  groups: { id: string; name: string }[];
  rows: SquadRow[];
  people: Map<string, SquadPerson>;
  locked: boolean;
}): SquadExportRow[] {
  const rows = countedRows(input.rows, input.people);
  const groups = [...input.groups].sort((a, b) => a.name.localeCompare(b.name));
  const name = (id: string) => input.people.get(id)?.name ?? "";
  return [...input.sports].sort((a, b) => a.position - b.position).flatMap((sport) =>
    groups.flatMap((g) => {
      const ids = squadMembers(rows, sport.id, g.id).sort((a, b) => name(a).localeCompare(name(b)));
      const players: SquadExportRow[] = ids.map((attendeeId) => ({ sport: sport.name, group: g.name, attendeeId, state: "" }));
      return ids.length < sport.min_size
        ? [...players, { sport: sport.name, group: g.name, attendeeId: null, state: input.locked ? "Forfeit" : "Short" }]
        : players;
    }),
  );
}
