import { GRACE_MS } from "@/lib/games/phase";

/** One `survival_players` row. `out_at_question` is written once, by the reveal (D272). */
export type PlayerRow = { attendee_id: string; out_at_question: number | null };

export function stillIn(rows: PlayerRow[]): string[] {
  return rows.filter((r) => r.out_at_question === null).map((r) => r.attendee_id);
}

/** Everyone who was in when question `q` was asked: the mosaic the reveal starts from (D275). */
export function inGoingInto(rows: PlayerRow[], q: number): string[] {
  return rows.filter((r) => r.out_at_question === null || r.out_at_question >= q).map((r) => r.attendee_id);
}

export function outAt(rows: PlayerRow[], q: number): string[] {
  return rows.filter((r) => r.out_at_question === q).map((r) => r.attendee_id);
}

export type RevealOutcome = { eliminated: string[]; survivors: string[]; everyoneSurvived: boolean };

/**
 * Who a reveal knocks out (D272). No answer is a wrong answer. If every player still in is
 * wrong, nobody goes out, so the game can never end with zero players. Mirrors survival_reveal
 * in 0049_games.sql.
 */
export function revealOutcome(alive: string[], answers: ReadonlyMap<string, number>, correct: number): RevealOutcome {
  const wrong = alive.filter((id) => answers.get(id) !== correct);
  if (alive.length > 0 && wrong.length === alive.length) {
    return { eliminated: [], survivors: [...alive], everyoneSurvived: true };
  }
  const out = new Set(wrong);
  return { eliminated: wrong, survivors: alive.filter((id) => !out.has(id)), everyoneSurvived: false };
}

/** How many picked each option, for the LED's locked screen (D276). */
export function answerSplit(choices: number[], optionCount: number): number[] {
  const counts = Array.from({ length: optionCount }, () => 0);
  for (const c of choices) if (c >= 0 && c < optionCount) counts[c] += 1;
  return counts;
}

/** One player left, or no questions left: time for the winner (D272). */
export function isOver(remaining: number, question: number, total: number): boolean {
  return remaining <= 1 || question >= total - 1;
}

/**
 * The answer window (D272): until the deadline plus the grace. survival_answer in 0049_games.sql
 * is what decides, on the database's clock (the one survival_reveal waits on); change both together.
 */
export function answerAccepted(deadlineMs: number, now: number): boolean {
  return now <= deadlineMs + GRACE_MS;
}
