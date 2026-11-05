import "server-only";
import type { Activity } from "@/lib/types";
import { squadPeople, squadRows } from "../db/tournaments";
import { claimForfeitMarking, setForfeit } from "../db/results";
import { isLocked, squadMembers } from "../lib/squads";
import { sideRows } from "../lib/sides";
import { loadSides } from "../db/super-teams";
import type { SportResults } from "../lib/results";

/**
 * D660: once squads have locked and the sport has its players, every group whose squad is below
 * the minimum is marked forfeit - once, by whichever organiser load or save gets there first. The
 * flag is stored, so a later cancellation can't take away points already won, and the admin can
 * lift it. True when this call did the marking (the caller then reads the sport again).
 */
export async function markForfeitsIfDue(cup: Activity, sr: SportResults, now = new Date()): Promise<boolean> {
  if (sr.sport.forfeits_marked_at || sr.pools.length === 0 || !isLocked(cup.squads_close_at, now)) return false;
  if (!(await claimForfeitMarking(sr.sport.id))) return false;
  const counted = await sideCounted(cup);
  const short = sr.pools.filter((p) => squadMembers(counted, sr.sport.id, p.group_id).length < sr.sport.min_size).map((p) => p.group_id);
  await setForfeit(sr.sport.id, short, true);
  return short.length > 0;
}

/** Before the marking: the groups whose squads are short now, for the Pools card's warning. */
export async function shortGroups(cup: Activity, sr: SportResults): Promise<string[]> {
  if (sr.pools.length === 0) return [];
  const counted = await sideCounted(cup);
  return sr.pools.filter((p) => !p.forfeit && squadMembers(counted, sr.sport.id, p.group_id).length < sr.sport.min_size).map((p) => p.group_id);
}

/** D829: counted squad rows keyed by side, so a super team's squad counts both its teams. */
async function sideCounted(cup: Activity) {
  const [rows, { sides }] = await Promise.all([squadRows(cup.id), loadSides(cup)]);
  return sideRows(rows, await squadPeople(cup.event_id, rows.map((r) => r.attendee_id)), sides);
}
