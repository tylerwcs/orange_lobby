import { describe, expect, it } from "vitest";
import {
  idleStage, hydrateStage, resolveStage, stageKey, phaseKind, canDo, allowedActions,
  lobbyWrite, raceStartWrite, raceStopWrite, questionWrite, overWrite, drawReadyWrite, drawRevealWrite, idleWrite,
  raceWindow, currentQuestion, questionDeadline, revealFacts, spinFacts, revealReadyAt, canReveal,
  drawExtra, roundWrite, showCardsWrite,
  COUNTDOWN_MS, GRACE_MS,
  type StageRow,
} from "@/lib/games/phase";

const T0 = Date.parse("2026-10-01T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const stage = (over: Partial<StageRow>): StageRow => ({ ...idleStage("e1"), game_id: "g1", run_id: "r1", version: 4, ...over });

describe("hydrateStage", () => {
  it("is idle at version 0 when there is no row", () => {
    expect(hydrateStage("e1", null)).toEqual(idleStage("e1"));
  });
  it("reads an unknown phase as idle but keeps the version", () => {
    expect(hydrateStage("e1", { phase: "poll", version: 7 })).toEqual(idleStage("e1", 7));
  });
});

describe("resolveStage", () => {
  const countdown = stage({
    phase: "race_countdown",
    phase_ends_at: iso(T0 + 3000),
    phase_data: { live_from: iso(T0 + 3000), live_until: iso(T0 + 23000) },
  });

  it("leaves a countdown alone before it ends", () => {
    expect(resolveStage(countdown, T0 + 1000).phase).toBe("race_countdown");
  });
  it("turns an ended countdown into the live race, ending at live_until", () => {
    const s = resolveStage(countdown, T0 + 3000);
    expect(s.phase).toBe("race_live");
    expect(s.phase_ends_at).toBe(iso(T0 + 23000));
  });
  it("chains a long-past countdown straight to results", () => {
    const s = resolveStage(countdown, T0 + 60_000);
    expect(s.phase).toBe("race_results");
    expect(s.phase_ends_at).toBeNull();
  });
  it("locks a question when its time is up", () => {
    const q = stage({ phase: "survival_question", phase_ends_at: iso(T0), phase_data: { question: 0, deadline: iso(T0) } });
    expect(resolveStage(q, T0).phase).toBe("survival_locked");
  });
  it("reveals a draw when the spin ends", () => {
    const d = stage({ phase: "draw_spinning", phase_ends_at: iso(T0), phase_data: { prize_no: 0, winner_ids: ["a1"] } });
    expect(resolveStage(d, T0 + 1).phase).toBe("draw_reveal");
  });
  it("reads a stage whose game was deleted as idle", () => {
    expect(resolveStage(stage({ phase: "race_lobby", game_id: null }), T0)).toEqual(idleStage("e1", 4));
  });
  it("does not change the version", () => {
    expect(resolveStage(countdown, T0 + 60_000).version).toBe(4);
  });
});

describe("stageKey", () => {
  it("changes when the clock moves a phase on, though the version did not", () => {
    const q = stage({ phase: "survival_question", phase_ends_at: iso(T0), phase_data: { question: 0 } });
    expect(stageKey(q, T0)).not.toBe(stageKey(resolveStage(q, T0), T0));
  });

  // A race that ended at T0 by the clock: results begin, but late batches count until T0 + grace.
  const ended = resolveStage(stage({
    phase: "race_countdown", phase_ends_at: iso(T0 - 23000),
    phase_data: { live_from: iso(T0 - 20000), live_until: iso(T0) },
  }), T0);

  it("keeps the results key while late tap batches may still count", () => {
    expect(ended.phase).toBe("race_results");
    expect(stageKey(ended, T0)).toBe("4:race_results");
    expect(stageKey(ended, T0 + GRACE_MS)).toBe("4:race_results");
  });
  it("gives the results a new key once the totals have settled, so phones fetch them again", () => {
    const later = T0 + GRACE_MS + 1000;
    expect(stageKey(ended, later)).toBe("4:race_results:settled");
    expect(stageKey(ended, later)).not.toBe(stageKey(ended, T0));
    expect(stageKey(ended, later + 60_000)).toBe(stageKey(ended, later));
  });
  it("treats a race stopped during its countdown as settled at once (it took no taps)", () => {
    const stopped = stage({ phase: "race_results", phase_data: { live_from: iso(T0 + 2000), live_until: iso(T0 + 2000) } });
    expect(stageKey(stopped, T0)).toBe("4:race_results:settled");
  });
  it("leaves other phases' keys alone", () => {
    expect(stageKey(stage({ phase: "race_lobby" }), T0)).toBe("4:race_lobby");
  });
});

describe("revealReadyAt / canReveal — no reveal while answers may still arrive (D272)", () => {
  const q = stage({ phase: "survival_question", phase_ends_at: iso(T0), phase_data: { question: 0, deadline: iso(T0) } });

  it("is ready at the deadline plus the answer grace", () => {
    expect(revealReadyAt(q)).toBe(T0 + GRACE_MS);
  });
  it("is null without a deadline", () => {
    expect(revealReadyAt(stage({ phase: "survival_reveal", phase_data: { question: 0 } }))).toBeNull();
  });
  it("waits through the grace although the question is already locked", () => {
    const locked = resolveStage(q, T0 + 300);
    expect(locked.phase).toBe("survival_locked");
    expect(canDo(locked.phase, "reveal")).toBe(true);
    expect(canReveal(locked, T0 + 300)).toBe(false);
    expect(canReveal(resolveStage(q, T0 + GRACE_MS - 1), T0 + GRACE_MS - 1)).toBe(false);
    expect(canReveal(resolveStage(q, T0 + GRACE_MS), T0 + GRACE_MS)).toBe(true);
  });
  it("never allows a reveal the phase does not", () => {
    expect(canReveal(q, T0 - 1)).toBe(false);
    expect(canReveal(stage({ phase: "survival_reveal", phase_data: { question: 0, deadline: iso(T0) } }), T0 + 60_000)).toBe(false);
  });
});

describe("phaseKind", () => {
  it("maps phases to their game kind", () => {
    expect([phaseKind("race_live"), phaseKind("survival_over"), phaseKind("draw_ready"), phaseKind("idle")])
      .toEqual(["tap_race", "survival", "draw", null]);
  });
});

describe("canDo", () => {
  it("only opens a game from idle", () => {
    expect(allowedActions("idle")).toEqual(["open"]);
  });
  it("cannot reveal while a question is still open", () => {
    expect(canDo("survival_question", "reveal")).toBe(false);
    expect(canDo("survival_locked", "reveal")).toBe(true);
  });
  it("allows nothing while a draw spins", () => {
    expect(allowedActions("draw_spinning")).toEqual([]);
  });
  it("lets the host switch games from a finished race without going idle first", () => {
    expect(canDo("race_results", "open")).toBe(true);
  });
});

describe("writes", () => {
  it("opens the right lobby for each kind", () => {
    expect(lobbyWrite({ id: "g1", kind: "tap_race" }, "r1").phase).toBe("race_lobby");
    expect(lobbyWrite({ id: "g1", kind: "survival" }, "r1").phase).toBe("survival_lobby");
    expect(lobbyWrite({ id: "g1", kind: "draw" }, "r1").phase).toBe("draw_ready");
  });
  it("starts a race 3 s from now and runs it for its duration", () => {
    const w = raceStartWrite(stage({ phase: "race_lobby" }), T0, 20);
    expect(w.phase).toBe("race_countdown");
    expect(w.phase_ends_at).toBe(iso(T0 + COUNTDOWN_MS));
    expect(w.phase_data).toEqual({ live_from: iso(T0 + 3000), live_until: iso(T0 + 23000) });
  });
  it("stops a live race now", () => {
    const live = stage({ phase: "race_live", phase_data: { live_from: iso(T0), live_until: iso(T0 + 20000) } });
    expect(raceStopWrite(live, T0 + 5000).phase_data).toEqual({ live_from: iso(T0), live_until: iso(T0 + 5000) });
  });
  it("stopping during the countdown leaves an empty window", () => {
    const cd = stage({ phase: "race_countdown", phase_data: { live_from: iso(T0 + 3000), live_until: iso(T0 + 23000) } });
    const w = raceStopWrite(cd, T0 + 1000);
    expect(w.phase).toBe("race_results");
    expect(w.phase_data).toEqual({ live_from: iso(T0 + 3000), live_until: iso(T0 + 3000) });
  });
  it("gives a question its answer time", () => {
    const w = questionWrite(stage({ phase: "survival_lobby" }), 0, T0, 10);
    expect(w.phase).toBe("survival_question");
    expect(w.phase_ends_at).toBe(iso(T0 + 10000));
    expect(w.phase_data).toEqual({ question: 0, deadline: iso(T0 + 10000) });
  });
  it("keeps the run and game through every in-game write", () => {
    const s = stage({ phase: "survival_reveal" });
    for (const w of [overWrite(s, 3), drawReadyWrite(s)]) expect([w.run_id, w.game_id]).toEqual(["r1", "g1"]);
  });
  it("goes idle with nothing attached", () => {
    expect(idleWrite()).toEqual({ run_id: null, game_id: null, phase: "idle", phase_data: {}, phase_ends_at: null });
  });
});

describe("readers", () => {
  it("reads the race window", () => {
    const s = stage({ phase: "race_live", phase_data: { live_from: iso(T0), live_until: iso(T0 + 20000) } });
    expect(raceWindow(s)).toEqual({ from: T0, until: T0 + 20000 });
  });
  it("reads the question and its deadline", () => {
    const s = stage({ phase: "survival_question", phase_data: { question: 2, deadline: iso(T0) } });
    expect([currentQuestion(s), questionDeadline(s)]).toEqual([2, T0]);
  });
  it("reads the reveal facts", () => {
    const s = stage({ phase: "survival_reveal", phase_data: { question: 0, eliminated: 5, remaining: 3, everyone_survived: false } });
    expect(revealFacts(s)).toEqual({ eliminated: 5, remaining: 3, everyoneSurvived: false });
  });
  it("reads the spin", () => {
    const s = stage({ phase: "draw_spinning", phase_data: { prize_no: 1, winner_ids: ["a1", "a2"] } });
    expect(spinFacts(s)).toEqual({ prizeNo: 1, winnerIds: ["a1", "a2"], newIds: ["a1", "a2"] });
  });
  it("reads a redraw's spin: the kept winners, then the replacement, which alone is new (D281)", () => {
    const s = stage({ phase: "draw_spinning", phase_data: { prize_no: 1, winner_ids: ["a1", "a3", "a4"], new_ids: ["a4"] } });
    expect(spinFacts(s)).toEqual({ prizeNo: 1, winnerIds: ["a1", "a3", "a4"], newIds: ["a4"] });
  });
  it("goes back to the reveal of the other winners when no one is left to redraw", () => {
    const s = stage({ phase: "draw_reveal", run_id: "r1", game_id: "g1", phase_data: { prize_no: 0, winner_ids: ["a1", "a2"] } });
    const w = drawRevealWrite(s, 0, ["a1"]);
    expect(w).toEqual({ run_id: "r1", game_id: "g1", phase: "draw_reveal", phase_data: { prize_no: 0, winner_ids: ["a1"], new_ids: [] }, phase_ends_at: null });
    expect(spinFacts({ ...s, ...w })).toEqual({ prizeNo: 0, winnerIds: ["a1"], newIds: [] });
  });
  it("returns null for data that is not there", () => {
    const s = stage({ phase: "race_lobby" });
    expect([raceWindow(s), currentQuestion(s), revealFacts(s), spinFacts(s)]).toEqual([null, null, null, null]);
  });
});

const drawStage = (phase: StageRow["phase"], phase_data: Record<string, unknown>, phase_ends_at: string | null = null): StageRow =>
  ({ event_id: "e", run_id: "r", game_id: "g", phase, phase_data, phase_ends_at, version: 7 });

describe("draw formats (D315, D317)", () => {
  it("a card spin lands on the landed reel, not the card pick or the reveal", () => {
    const s = drawStage("draw_spinning", { cards: true, prize_no: null, winner_ids: ["a"] }, new Date(1000).toISOString());
    expect(resolveStage(s, 2000)).toMatchObject({ phase: "draw_card_landed", phase_ends_at: null, version: 7 });
  });
  it("a card spin still spins before its end", () => {
    const s = drawStage("draw_spinning", { cards: true, prize_no: null, winner_ids: ["a"] }, new Date(3000).toISOString());
    expect(resolveStage(s, 2000).phase).toBe("draw_spinning");
  });
  it("a card spin whose cards are shown resolves to the card pick", () => {
    const s = drawStage("draw_spinning", { cards: true, cards_shown: true, prize_no: null, winner_ids: ["a"] }, new Date(1000).toISOString());
    expect(resolveStage(s, 2000).phase).toBe("draw_card_pick");
  });
  it("only a true cards_shown shows the cards", () => {
    const s = drawStage("draw_spinning", { cards: true, cards_shown: "yes", prize_no: null, winner_ids: ["a"] }, new Date(1000).toISOString());
    expect(resolveStage(s, 2000).phase).toBe("draw_card_landed");
  });
  it("Show the cards keeps the stored spin, its winner and its data, adds cards_shown and ends it in the past", () => {
    const data = { cards: true, prize_no: null, winner_ids: ["a"], new_ids: ["a"], spin_ms: 5000, pool_at: "2026-10-01T02:00:00.000Z" };
    const s = drawStage("draw_spinning", data, new Date(1000).toISOString());
    const w = showCardsWrite(s, 5000);
    expect(w).toEqual({
      run_id: "r", game_id: "g", phase: "draw_spinning",
      phase_data: { ...data, cards_shown: true }, phase_ends_at: new Date(4000).toISOString(),
    });
    // card_pick (0050) needs a stored draw_spinning with cards and the winner, past its end.
    expect(resolveStage({ ...s, ...w }, 5000).phase).toBe("draw_card_pick");
    expect(spinFacts({ ...s, ...w })).toEqual({ prizeNo: null, winnerIds: ["a"], newIds: ["a"] });
    expect(drawExtra({ ...s, ...w }).cards).toBe(true);
  });
  it("Show the cards does not change the stage it was given", () => {
    const s = drawStage("draw_spinning", { cards: true, prize_no: null, winner_ids: ["a"] }, new Date(1000).toISOString());
    showCardsWrite(s, 5000);
    expect(s.phase_data).toEqual({ cards: true, prize_no: null, winner_ids: ["a"] });
  });
  it("the landed reel is a draw phase", () => {
    expect(phaseKind("draw_card_landed")).toBe("draw");
  });
  it("a normal spin still lands on the reveal", () => {
    const s = drawStage("draw_spinning", { prize_no: 0, winner_ids: ["a"] }, new Date(1000).toISOString());
    expect(resolveStage(s, 2000).phase).toBe("draw_reveal");
  });
  it("reads a card turn's facts with no prize", () => {
    expect(spinFacts(drawStage("draw_card_pick", { cards: true, prize_no: null, winner_ids: ["a"], new_ids: ["a"] })))
      .toEqual({ prizeNo: null, winnerIds: ["a"], newIds: ["a"] });
  });
  it("has no spin facts without a prize key", () => {
    expect(spinFacts(drawStage("draw_ready", {}))).toBeNull();
  });
  it("reads the draw extras", () => {
    const at = "2026-10-01T02:00:00.000Z";
    expect(drawExtra(drawStage("draw_rounds", { round: 1, rounds: 4, pool_at: at, spin_ms: 6000, quick: true, cards: false, card_no: 3 })))
      .toEqual({ spinMs: 6000, quick: true, cards: false, round: 1, rounds: 4, poolAt: Date.parse(at), cardNo: 3 });
  });
  it("Next round moves the round on, shows the last round, then goes to the reveal", () => {
    const s = drawStage("draw_rounds", { prize_no: 0, winner_ids: ["a"], round: 2, rounds: 4 });
    expect(roundWrite(s)).toMatchObject({ phase: "draw_rounds", phase_data: { round: 3, rounds: 4, winner_ids: ["a"] } });
    // The last round is shown (only the winners standing), then the next press reveals them.
    expect(roundWrite({ ...s, phase_data: { ...s.phase_data, round: 3 } })).toMatchObject({ phase: "draw_rounds", phase_data: { round: 4, rounds: 4 } });
    expect(roundWrite({ ...s, phase_data: { ...s.phase_data, round: 4 } })).toMatchObject({ phase: "draw_reveal", phase_data: { round: 4, rounds: 4, winner_ids: ["a"] } });
  });
  it("has no round write outside the rounds", () => {
    expect(roundWrite(drawStage("draw_reveal", { prize_no: 0, winner_ids: ["a"] }))).toBeNull();
  });
  it("lets the host do only what each new phase allows", () => {
    expect(allowedActions("draw_rounds")).toEqual(["round", "idle"]);
    expect(allowedActions("draw_card_landed")).toEqual(["show", "redraw", "idle"]);
    expect(allowedActions("draw_card_pick")).toEqual(["pick", "redraw", "idle"]);
    // Next participant goes back to the waiting reel (present), not straight into a spin.
    expect(allowedActions("draw_card_reveal")).toEqual(["present", "idle"]);
    expect(canDo("draw_card_reveal", "draw")).toBe(false);
    expect(canDo("draw_card_pick", "show")).toBe(false);
  });
});
