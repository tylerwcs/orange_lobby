import type { TournamentSport } from "./squads";

/**
 * Tournament results (D653-D672). The database keeps only pools, matches and their slots; this
 * module works out the rest - who is in each slot, outcomes, standings, places, points, the
 * overall table - on every read, so a corrected score fixes everything after it (D670). Pure, so
 * the admin tabs, the portal and the export say the same thing.
 */

export type ResultKind = TournamentSport["result_kind"];

/** D655: a group playing a sport, in a pool (0 = Pool A). Manual format: pool 0, and the admin's place. */
export type PoolGroup = { sport_id: string; group_id: string; pool: number; forfeit: boolean; manual_place: number | null };

/** D669: a match or race. Pool matches carry their pool, bracket ones their bracket (0 = Gold). */
export type Match = {
  id: string;
  sport_id: string;
  stage: "pool" | "bracket" | "manual";
  pool: number | null;
  bracket: number | null;
  /** "pool", "semi", "final", "third", "race", or the admin's round name (D665). */
  round: string;
  position: number;
  walkover_to: string | null;
  went_through: string | null;
};

/** D651: a fixed group (null while empty) or a pointer to another match's winner or loser. */
export type Slot = {
  match_id: string;
  slot: number;
  group_id: string | null;
  source_match_id: string | null;
  source_outcome: "winner" | "loser" | null;
  score: number | null;
  time_ms: number | null;
  dnf: boolean;
};

export type SportResults = { sport: TournamentSport; pools: PoolGroup[]; matches: Match[]; slots: Slot[] };

/** What `set_sport_plan` writes: a sport's pools and its matches with their slots, ids chosen here. */
export type MatchPlan = {
  pools: Omit<PoolGroup, "sport_id">[];
  matches: (Omit<Match, "sport_id" | "walkover_to" | "went_through"> & { slots: Pick<Slot, "slot" | "group_id" | "source_match_id" | "source_outcome">[] })[];
};
