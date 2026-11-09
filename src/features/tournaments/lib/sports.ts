import { MAX_POOL, MIN_POOL } from "./results";

/** The bounds the database holds a sport to (migration 0097). */
export const MAX_SQUAD = 30;
export const MAX_SPORT_NAME = 60;

type SportForm = { text(key: string): string; checked(key: string): boolean };

export type SportSettings = {
  name: string; min_size: number; max_size: number; result_kind: "score" | "time"; format: "pools" | "manual" | "lanes"; pool_size: number;
  /** D860: a lane draw's lanes and games (kept at 6 and 4 for other formats). */
  lane_count: number; games: number;
};

export const MAX_LANES = 20;
export const MAX_GAMES = 10;

/**
 * D638, D653: a sport from the Add / Edit sport form. One number is an exact squad size; "Allow
 * subs" adds a most-players number above it. Results type, format and pool size default to
 * scores, pools of 3. Throws the organiser's sentence on bad input.
 */
export function readSport(form: SportForm): SportSettings {
  const name = form.text("name");
  if (!name) throw new Error("A sport needs a name");
  if (name.length > MAX_SPORT_NAME) throw new Error(`Keep the sport's name to ${MAX_SPORT_NAME} characters`);
  const size = Number(form.text("size"));
  if (!Number.isInteger(size) || size < 1) throw new Error("Squad size must be at least 1");
  const max = form.checked("subs") ? Number(form.text("max")) : size;
  if (!Number.isInteger(max) || max < size) throw new Error("The most players can't be fewer than the squad size");
  if (size > MAX_SQUAD || max > MAX_SQUAD) throw new Error(`A squad can have at most ${MAX_SQUAD} players`);
  const poolText = form.text("pool_size");
  const pool_size = poolText ? Number(poolText) : 3;
  if (!Number.isInteger(pool_size) || pool_size < MIN_POOL || pool_size > MAX_POOL) throw new Error(`Pool size must be from ${MIN_POOL} to ${MAX_POOL}.`);
  const asked = form.text("format");
  const format = asked === "manual" || asked === "lanes" ? asked : "pools";
  let lane_count = 6;
  let games = 4;
  if (format === "lanes") {
    lane_count = Number(form.text("lanes"));
    if (!Number.isInteger(lane_count) || lane_count < 1 || lane_count > MAX_LANES) throw new Error(`Lanes must be from 1 to ${MAX_LANES}.`);
    games = Number(form.text("games"));
    if (!Number.isInteger(games) || games < 1 || games > MAX_GAMES) throw new Error(`Games must be from 1 to ${MAX_GAMES}.`);
  }
  return {
    name, min_size: size, max_size: max,
    // D860: a lane draw is always scored.
    result_kind: format !== "lanes" && form.text("result_kind") === "time" ? "time" : "score",
    format,
    pool_size, lane_count, games,
  };
}
