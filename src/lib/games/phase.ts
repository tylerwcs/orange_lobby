import type { GameKind } from "@/lib/games/config";

export const PHASES = [
  "idle",
  "race_lobby", "race_countdown", "race_live", "race_results",
  "survival_lobby", "survival_question", "survival_locked", "survival_reveal", "survival_over",
  "draw_ready", "draw_spinning", "draw_reveal",
  // Draw formats (D315, D317): the mosaic's rounds, and a card round's pick and flip.
  "draw_rounds", "draw_card_pick", "draw_card_reveal",
] as const;
export type Phase = (typeof PHASES)[number];

export const COUNTDOWN_MS = 3000;
/** A "Not here" redraw's quick reel (D318). A first spin lasts its game's spin_s (D311). */
export const QUICK_SPIN_MS = 3000;
/** How late a tap batch or an answer may arrive and still count (D266, D272). */
export const GRACE_MS = 1500;

/** One event's `game_stage` row (D250). */
export type StageRow = {
  event_id: string;
  run_id: string | null;
  game_id: string | null;
  phase: Phase;
  phase_data: Record<string, unknown>;
  phase_ends_at: string | null;
  version: number;
};

/** What a host action writes. The version and event are the RPC's business. */
export type StageWrite = Pick<StageRow, "run_id" | "game_id" | "phase" | "phase_data" | "phase_ends_at">;

export function idleStage(eventId: string, version = 0): StageRow {
  return { event_id: eventId, run_id: null, game_id: null, phase: "idle", phase_data: {}, phase_ends_at: null, version };
}

const isPhase = (v: unknown): v is Phase => typeof v === "string" && (PHASES as readonly string[]).includes(v);

/** A `game_stage` row from the database; idle when there is none or its phase no longer reads. */
export function hydrateStage(eventId: string, row: unknown): StageRow {
  if (!row) return idleStage(eventId);
  const r = row as Partial<StageRow> & { phase?: unknown };
  const version = typeof r.version === "number" ? r.version : 0;
  if (!isPhase(r.phase)) return idleStage(eventId, version);
  return {
    event_id: eventId, run_id: r.run_id ?? null, game_id: r.game_id ?? null, phase: r.phase,
    phase_data: (r.phase_data ?? {}) as Record<string, unknown>, phase_ends_at: r.phase_ends_at ?? null, version,
  };
}

const passed = (iso: string | null, now: number) => iso !== null && now >= Date.parse(iso);
const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * The stage as it stands at `now` (D258). Timed phases move on by the clock, not by a job: a
 * countdown whose end has passed IS the live race, and a race whose end has passed IS the
 * results — so a stage read long after a countdown lands on results. A game deleted mid-play
 * (its id nulled by the foreign key) reads as idle. The version is never changed here; only a
 * host write moves it.
 */
export function resolveStage(s: StageRow, now: number): StageRow {
  if (s.phase !== "idle" && !s.game_id) return idleStage(s.event_id, s.version);
  let cur = s;
  if (cur.phase === "race_countdown" && passed(cur.phase_ends_at, now)) {
    cur = { ...cur, phase: "race_live", phase_ends_at: str(cur.phase_data.live_until) };
  }
  if (cur.phase === "race_live" && (cur.phase_ends_at === null || passed(cur.phase_ends_at, now))) {
    return { ...cur, phase: "race_results", phase_ends_at: null };
  }
  if (cur.phase === "survival_question" && passed(cur.phase_ends_at, now)) {
    return { ...cur, phase: "survival_locked", phase_ends_at: null };
  }
  if (cur.phase === "draw_spinning" && passed(cur.phase_ends_at, now)) {
    // A card round's reel names the participant, who then picks a card (D317).
    return { ...cur, phase: cur.phase_data.cards === true ? "draw_card_pick" : "draw_reveal", phase_ends_at: null };
  }
  return cur;
}

/**
 * Changes whenever anything a client shows could have: a host write, the clock moving a phase
 * on, or a race's totals settling. Race results begin at live_until, but race_add_taps takes
 * batches until live_until + GRACE_MS, so without the ":settled" step a phone that fetched its
 * result at the whistle would keep those pre-grace totals (its key would never change again).
 * `s` is the resolved stage at `now`.
 */
export function stageKey(s: StageRow, now: number): string {
  const base = `${s.version}:${s.phase}`;
  if (s.phase !== "race_results") return base;
  return raceSettled(s, now) ? `${base}:settled` : base;
}

/**
 * Past the grace, with a second's margin for the per-instance taps memo (250 ms) and for the
 * app and database clocks disagreeing a little.
 */
const SETTLE_MARGIN_MS = 1000;

/**
 * A race's totals can no longer change: the last batch race_add_taps would take (live_until +
 * GRACE_MS) is behind us, plus a margin. A race stopped during its countdown has an empty
 * window and takes no taps at all (race_add_taps), so it is settled from the start.
 */
function raceSettled(s: StageRow, now: number): boolean {
  const w = raceWindow(s);
  return !w || w.until <= w.from || now >= w.until + GRACE_MS + SETTLE_MARGIN_MS;
}

export function phaseKind(p: Phase): GameKind | null {
  if (p.startsWith("race_")) return "tap_race";
  if (p.startsWith("survival_")) return "survival";
  if (p.startsWith("draw_")) return "draw";
  return null;
}

export type HostAction =
  | "open" | "start" | "stop" | "reveal" | "next" | "finish" | "draw" | "present" | "redraw" | "idle"
  | "round" | "pick";

/**
 * What the host may do in each phase. "idle" (end the game) is the escape hatch from almost
 * everywhere; not during a countdown or live race (Stop is the control there) or a spin (it
 * lands in five seconds).
 */
const ALLOWED: Record<Phase, HostAction[]> = {
  idle: ["open"],
  race_lobby: ["start", "idle"],
  race_countdown: ["stop"],
  race_live: ["stop"],
  race_results: ["open", "idle"],
  survival_lobby: ["start", "idle"],
  survival_question: ["idle"],
  survival_locked: ["reveal", "idle"],
  survival_reveal: ["next", "finish", "idle"],
  survival_over: ["open", "idle"],
  draw_ready: ["draw", "open", "idle"],
  draw_spinning: [],
  draw_reveal: ["present", "redraw", "idle"],
  draw_rounds: ["round", "idle"],
  draw_card_pick: ["pick", "redraw", "idle"],
  draw_card_reveal: ["draw", "idle"],
};

export function allowedActions(p: Phase): HostAction[] {
  return ALLOWED[p];
}

export function canDo(p: Phase, a: HostAction): boolean {
  return ALLOWED[p].includes(a);
}

const keep = (s: StageRow) => ({ run_id: s.run_id, game_id: s.game_id });

export function idleWrite(): StageWrite {
  return { run_id: null, game_id: null, phase: "idle", phase_data: {}, phase_ends_at: null };
}

export function lobbyWrite(game: { id: string; kind: GameKind }, runId: string): StageWrite {
  const phase: Phase = game.kind === "tap_race" ? "race_lobby" : game.kind === "survival" ? "survival_lobby" : "draw_ready";
  return { run_id: runId, game_id: game.id, phase, phase_data: {}, phase_ends_at: null };
}

/** Start: a 3 s countdown, then the race for its duration (D265). Both ends fixed now. */
export function raceStartWrite(s: StageRow, now: number, durationS: number): StageWrite {
  const liveFrom = new Date(now + COUNTDOWN_MS).toISOString();
  const liveUntil = new Date(now + COUNTDOWN_MS + durationS * 1000).toISOString();
  return { ...keep(s), phase: "race_countdown", phase_data: { live_from: liveFrom, live_until: liveUntil }, phase_ends_at: liveFrom };
}

/**
 * Stop: the race ends now. Stopped during the countdown the race never ran, so its window is
 * empty (it ends where it would have started) rather than ending before it began.
 */
export function raceStopWrite(s: StageRow, now: number): StageWrite {
  const from = str(s.phase_data.live_from) ?? new Date(now).toISOString();
  const until = new Date(Math.max(now, Date.parse(from))).toISOString();
  return { ...keep(s), phase: "race_results", phase_data: { live_from: from, live_until: until }, phase_ends_at: null };
}

export function questionWrite(s: StageRow, question: number, now: number, answerS: number): StageWrite {
  const deadline = new Date(now + answerS * 1000).toISOString();
  return { ...keep(s), phase: "survival_question", phase_data: { question, deadline }, phase_ends_at: deadline };
}

export function overWrite(s: StageRow, question: number): StageWrite {
  return { ...keep(s), phase: "survival_over", phase_data: { question }, phase_ends_at: null };
}

export function drawReadyWrite(s: StageRow): StageWrite {
  return { ...keep(s), phase: "draw_ready", phase_data: {}, phase_ends_at: null };
}

export function raceWindow(s: StageRow): { from: number; until: number } | null {
  const from = str(s.phase_data.live_from);
  const until = str(s.phase_data.live_until);
  return from && until ? { from: Date.parse(from), until: Date.parse(until) } : null;
}

export function currentQuestion(s: StageRow): number | null {
  return num(s.phase_data.question);
}

export function questionDeadline(s: StageRow): number | null {
  const d = str(s.phase_data.deadline);
  return d ? Date.parse(d) : null;
}

/**
 * When the host may reveal (D272): once the last in-time answer can no longer arrive, i.e. the
 * deadline plus the answer grace (answerAccepted). survival_reveal in 0049_games.sql refuses
 * before then, so the host console waits for this rather than tapping into a refusal. Null when
 * the stage has no question deadline.
 */
export function revealReadyAt(s: StageRow): number | null {
  const d = questionDeadline(s);
  return d === null ? null : d + GRACE_MS;
}

/** Reveal is on the menu (canDo) AND the answer grace is over. `s` is the resolved stage at `now`. */
export function canReveal(s: StageRow, now: number): boolean {
  const at = revealReadyAt(s);
  return canDo(s.phase, "reveal") && at !== null && now >= at;
}

export function revealFacts(s: StageRow): { eliminated: number; remaining: number; everyoneSurvived: boolean } | null {
  const eliminated = num(s.phase_data.eliminated);
  const remaining = num(s.phase_data.remaining);
  if (eliminated === null || remaining === null) return null;
  return { eliminated, remaining, everyoneSurvived: s.phase_data.everyone_survived === true };
}

const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);

/**
 * A draw on stage (D280, D281). `winnerIds` is everyone the LED reveals for the prize: after a
 * redraw, the winners kept from the earlier spin and then the replacement (draw_spin's p_keep).
 * `newIds` is only what this spin drew (all of them for a first spin, or when the stage
 * predates new_ids).
 */
export function spinFacts(s: StageRow): { prizeNo: number | null; winnerIds: string[]; newIds: string[] } | null {
  const winnerIds = ids(s.phase_data.winner_ids);
  if (!winnerIds || !("prize_no" in s.phase_data)) return null;
  return { prizeNo: num(s.phase_data.prize_no), winnerIds, newIds: ids(s.phase_data.new_ids) ?? winnerIds };
}

/**
 * "Not here" with no one left to draw (D281): back to the reveal of the prize's other winners,
 * so each of them can still be sent away in turn.
 */
export function drawRevealWrite(s: StageRow, prizeNo: number | null, winnerIds: string[]): StageWrite {
  return { ...keep(s), phase: "draw_reveal", phase_data: { prize_no: prizeNo, winner_ids: winnerIds, new_ids: [] }, phase_ends_at: null };
}

/** What draw_spin and card_pick add to a draw's phase_data (D311, D315, D316, D317). */
export type DrawExtra = {
  spinMs: number | null;
  quick: boolean;
  cards: boolean;
  round: number | null;
  rounds: number | null;
  poolAt: number | null;
  cardNo: number | null;
};

export function drawExtra(s: StageRow): DrawExtra {
  const at = str(s.phase_data.pool_at);
  return {
    spinMs: num(s.phase_data.spin_ms),
    quick: s.phase_data.quick === true,
    cards: s.phase_data.cards === true,
    round: num(s.phase_data.round),
    rounds: num(s.phase_data.rounds),
    poolAt: at ? Date.parse(at) : null,
    cardNo: num(s.phase_data.card_no),
  };
}

/**
 * Next round of a mosaic draw (D315). Round 0 is the full pool; each press shows the next
 * round, up to and including the last (round === rounds), where only the winners stand. The
 * press after the last round reveals the winners.
 */
export function roundWrite(s: StageRow): StageWrite | null {
  const { round, rounds } = drawExtra(s);
  if (s.phase !== "draw_rounds" || round === null || rounds === null) return null;
  if (round >= rounds) return { ...keep(s), phase: "draw_reveal", phase_data: { ...s.phase_data }, phase_ends_at: null };
  return { ...keep(s), phase: "draw_rounds", phase_data: { ...s.phase_data, round: round + 1 }, phase_ends_at: null };
}
