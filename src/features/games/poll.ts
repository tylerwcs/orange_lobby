import type { Phase } from "./phase";

export { clockOffset, backoff } from "@/lib/poll";

const ACTIVE: ReadonlySet<Phase> = new Set<Phase>([
  "race_lobby", "race_countdown", "race_live",
  "survival_lobby", "survival_question", "survival_locked", "survival_reveal",
  "draw_ready", "draw_spinning", "draw_reveal",
  "draw_rounds", "draw_card_landed", "draw_card_pick", "draw_card_reveal",
]);

/** Once a second while a game is on, every 5 s otherwise (D256). */
export function phoneInterval(phase: Phase | null): number {
  return phase && ACTIVE.has(phase) ? 1000 : 5000;
}

/** Four times a second during a race so the lanes move smoothly, once a second otherwise. */
export function displayInterval(phase: Phase | null): number {
  return phase === "race_countdown" || phase === "race_live" ? 250 : 1000;
}

export const HOST_INTERVAL = 1000;
