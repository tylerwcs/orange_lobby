import { categoryMatches } from "@/lib/agenda";
import type { SubmitCode } from "../db/activities";

/**
 * Submit together with someone from another team (spec 2026-10-14, D524-D535). Pure and
 * client-safe: who may be tagged, what a refusal says, and the "With …" line every surface shows.
 */

/** Whose refusal `submit_answers_pair` returned: the member's own, or the tagged partner's. */
export type PairWho = "self" | "partner";
/** `submit_answers`' codes, plus the pair rules `submit_answers_pair` checks first (D526). */
export type PairCode = SubmitCode | "pairoff" | "pairself" | "pairsame" | "pairnoteam" | "pairnoteam_self";

export type PairTeam = { id: string; name: string; people: { id: string; name: string }[] };

/**
 * D526/D530: who the picker offers - every other team's members who may enter this activity, by
 * team, names sorted. A proxy only ever submits for their own group (D392), so "the member's team"
 * is always `myGroupId`. Nobody is offered to someone in no team: the pair needs two teams.
 */
export function pairCandidates(
  groups: { id: string; name: string }[],
  attendees: { id: string; name: string; group_id: string | null; category: string | null }[],
  myGroupId: string | null,
  categories: string[] | null,
): PairTeam[] {
  if (!myGroupId) return [];
  return groups
    .filter((g) => g.id !== myGroupId)
    .map((g) => ({
      id: g.id,
      name: g.name,
      people: attendees
        .filter((a) => a.group_id === g.id && categoryMatches(categories, a.category))
        .map((a) => ({ id: a.id, name: a.name }))
        .sort((x, y) => x.name.localeCompare(y.name)),
    }))
    .filter((t) => t.people.length > 0);
}

/**
 * D529: what a refused tagged submit says. Null for `ok` and for the member's own refusals, which
 * keep the submit action's usual wording; everything about the partner names them.
 */
export function pairRefusal(code: PairCode, who: PairWho, partner: string): string | null {
  if (code === "ok") return null;
  if (code === "pairnoteam_self") return "You need to be in a team to tag someone.";
  if (who === "self") return null;
  switch (code) {
    case "pairsame": return `${partner} is on your team. Tag someone from another team.`;
    case "pairnoteam":
    case "nogroup": return `${partner} isn't in a team yet.`;
    case "ineligible": return `${partner} can't take part in this activity.`;
    case "today": return `${partner} already has an entry today.`;
    case "limit":
    case "groupdone": return `${partner} has reached the limit for this activity.`;
    case "duplicate": return `${partner} already sent this photo in another entry.`;
    case "pairself": return "Pick someone other than the person this entry is for.";
    case "pairoff": return "Tagging someone isn't on for this activity.";
    default: return `Couldn't add ${partner}. Try again.`;
  }
}

/** D531: the line under a paired entry; nothing once the partner's entry is gone. */
export function withText(partnerName: string | null | undefined): string | null {
  return partnerName ? `With ${partnerName}` : null;
}
