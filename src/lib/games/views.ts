import type { Game, GameKind } from "@/lib/games/config";
import {
  currentQuestion, questionDeadline, raceWindow, revealFacts, spinFacts, stageKey,
  type Phase, type StageRow,
} from "@/lib/games/phase";

/** Option colours, the same on the LED and the phones so "pick red" works across the room. */
export const OPTION_STYLES = [
  { letter: "A", colour: "#E5484D" },
  { letter: "B", colour: "#3E63DD" },
  { letter: "C", colour: "#F5A524" },
  { letter: "D", colour: "#30A46C" },
] as const;

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
  game: { id: string; kind: GameKind; title: string } | null;
  race: { liveFrom: number; liveUntil: number; duration_s: number } | null;
  question: PublicQuestion | null;
  reveal: { eliminated: number; remaining: number; everyoneSurvived: boolean } | null;
  prizeNo: number | null;
};

const REVEALED: ReadonlySet<Phase> = new Set<Phase>(["survival_reveal", "survival_over"]);

/**
 * The stage as anyone may see it: phones, the LED, the host. The one secret is the correct
 * answer, which is only here once the host has revealed it — never while a question is open,
 * or any phone could read it off the wire.
 */
export function publicStage(s: StageRow, game: Game | null): PublicStage {
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
    key: stageKey(s),
    phase: s.phase,
    endsAt: s.phase_ends_at ? Date.parse(s.phase_ends_at) : null,
    game: g ? { id: g.id, kind: g.kind, title: g.title } : null,
    race: g?.kind === "tap_race" && w ? { liveFrom: w.from, liveUntil: w.until, duration_s: g.config.duration_s } : null,
    question,
    reveal: revealFacts(s),
    prizeNo: spinFacts(s)?.prizeNo ?? null,
  };
}
