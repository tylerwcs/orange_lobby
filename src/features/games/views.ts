import type { Game, GameKind } from "./config";
import { backgroundOf } from "./background";
import {
  currentQuestion, questionDeadline, raceWindow, revealFacts, spinFacts, stageKey,
  type Phase, type StageRow,
} from "./phase";

/**
 * Option colours and shapes, the same on the LED and the phones so "pick red" and "pick the
 * triangle" both work across the room (D306); the shape is for colour-blind players.
 */
export const OPTION_STYLES = [
  { letter: "A", colour: "#E5484D", shape: "▲" },
  { letter: "B", colour: "#3E63DD", shape: "◆" },
  { letter: "C", colour: "#F5A524", shape: "●" },
  { letter: "D", colour: "#30A46C", shape: "■" },
] as const;

/** D's colour when the LED is keyed on green (D299). */
export const GREEN_SAFE_D = "#8E4EC6";

export type OptionStyle = { letter: string; colour: string; shape: string };

/** The options as a green-screened game shows them; the phone uses the same, so colours match. */
export function optionStyles(green: boolean): OptionStyle[] {
  return OPTION_STYLES.map((o, i) => ({ letter: o.letter, colour: green && i === 3 ? GREEN_SAFE_D : o.colour, shape: o.shape }));
}

export type PublicQuestion = {
  no: number;
  total: number;
  text: string;
  options: string[];
  answer_s: number;
  deadline: number | null;
  /** Null until the host reveals it (D276). */
  correct: number | null;
};

export type PublicStage = {
  key: string;
  phase: Phase;
  endsAt: number | null;
  game: { id: string; kind: GameKind; title: string; green: boolean } | null;
  race: { liveFrom: number; liveUntil: number; duration_s: number } | null;
  question: PublicQuestion | null;
  reveal: { eliminated: number; remaining: number; everyoneSurvived: boolean } | null;
  prizeNo: number | null;
};

const REVEALED: ReadonlySet<Phase> = new Set<Phase>(["survival_reveal", "survival_over"]);

/**
 * The stage as anyone may see it: phones, the LED, the host. The one secret is the correct
 * answer, which is only here once the host has revealed it — never while a question is open,
 * or any phone could read it off the wire. `s` is the stage resolved at `now` (see stageKey).
 */
export function publicStage(s: StageRow, game: Game | null, now: number): PublicStage {
  const g = game && s.game_id === game.id ? game : null;
  const q = currentQuestion(s);
  let question: PublicQuestion | null = null;
  if (g?.kind === "survival" && q !== null && s.phase !== "survival_lobby") {
    const item = g.config.questions[q];
    if (item) {
      question = {
        no: q, total: g.config.questions.length, text: item.text, options: item.options,
        answer_s: g.config.answer_s, deadline: questionDeadline(s),
        correct: REVEALED.has(s.phase) ? item.correct : null,
      };
    }
  }
  const w = raceWindow(s);
  return {
    key: stageKey(s, now),
    phase: s.phase,
    endsAt: s.phase_ends_at ? Date.parse(s.phase_ends_at) : null,
    game: g ? { id: g.id, kind: g.kind, title: g.title, green: backgroundOf(g).kind === "green" } : null,
    race: g?.kind === "tap_race" && w ? { liveFrom: w.from, liveUntil: w.until, duration_s: g.config.duration_s } : null,
    question,
    reveal: revealFacts(s),
    prizeNo: spinFacts(s)?.prizeNo ?? null,
  };
}

/**
 * When a winner screen's confetti starts, in ms after its phase begins: after the podium has
 * risen (D305), or the card has flipped (D317). Null where there is nothing to celebrate.
 */
export function celebrationDelay(phase: Phase): number | null {
  if (phase === "race_results") return 1600;
  if (phase === "draw_card_reveal") return 2000;
  if (phase === "survival_over" || phase === "draw_reveal") return 0;
  return null;
}

/**
 * The stage key without race results' ":settled" step (stageKey). The totals settling ~2.5 s
 * after the whistle is new data, not a new screen, so the LED's one-off moments — the fanfare,
 * the confetti — key on this and do not fire a second time.
 */
export function showKey(key: string): string {
  return key.endsWith(":settled") ? key.slice(0, -":settled".length) : key;
}

/**
 * A winner screen with nobody on it: a draw reveal with no one left to draw, or race results
 * with no lanes. No fanfare and no confetti there (celebrationDelay stays about the phase).
 */
export function emptyCelebration(state: {
  stage: { phase: Phase };
  race: { lanes: unknown[] } | null;
  draw: { winners: unknown[] | null } | null;
}): boolean {
  if (state.stage.phase === "draw_reveal") return (state.draw?.winners?.length ?? 0) === 0;
  if (state.stage.phase === "race_results") return (state.race?.lanes.length ?? 0) === 0;
  return false;
}
