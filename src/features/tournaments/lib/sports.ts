import { MAX_POOL, MIN_POOL } from "./results";

/** The bounds the database holds a sport to (migration 0097). */
export const MAX_SQUAD = 30;
export const MAX_SPORT_NAME = 60;

type SportForm = { text(key: string): string; checked(key: string): boolean };

export type SportSettings = { name: string; min_size: number; max_size: number; result_kind: "score" | "time"; format: "pools" | "manual"; pool_size: number };

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
  return {
    name, min_size: size, max_size: max,
    result_kind: form.text("result_kind") === "time" ? "time" : "score",
    format: form.text("format") === "manual" ? "manual" : "pools",
    pool_size,
  };
}
