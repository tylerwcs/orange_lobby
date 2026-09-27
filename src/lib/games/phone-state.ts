import "server-only";
import type { Game } from "@/lib/games/config";
import { currentQuestion, spinFacts, stageKey, type StageRow } from "@/lib/games/phase";
import { laneKeyFor, laneLabel, standings } from "@/lib/games/race";
import { publicStage } from "@/lib/games/views";
import type { PhoneMe, PhoneState } from "@/lib/games/wire";
import { getAnswer, getPlayer, getTapRow } from "@/lib/db/games";
import { liveStage, runFor, tapsFor, type PlayContext } from "@/lib/games/live";

export type { PlayContext };

/**
 * A phone's view (D259). When the stage key is the one the phone already has, the answer is
 * three fields and no personal reads at all — that is what 500 phones polling once a second
 * mostly get.
 */
export async function phoneState(ctx: PlayContext, v: string | null, now: number): Promise<PhoneState> {
  const { stage, game } = await liveStage(ctx.event.id, now);
  const key = stageKey(stage, now);
  if (v === key) return { now, key, unchanged: true };
  return { now, key, stage: publicStage(stage, game, now), me: await phoneMe(ctx, stage, game) };
}

/** Only ever the phone's own rows, in the run on this event's stage. */
async function phoneMe(ctx: PlayContext, stage: StageRow, game: Game | null): Promise<PhoneMe> {
  const runId = stage.run_id;
  if (!game || !runId || stage.game_id !== game.id) return { kind: "none" };

  if (game.kind === "tap_race") {
    const [run, mine] = await Promise.all([runFor(runId, ctx.event.id), getTapRow(runId, ctx.attendee.id)]);
    const grouping = run?.grouping ?? { by: "solo" as const };
    const laneKey = mine?.lane_key ?? laneKeyFor(ctx.attendee, grouping);
    const lane = laneLabel(laneKey, grouping, () => ctx.attendee.name);
    let place: number | null = null;
    let lanes = 0;
    if (stage.phase === "race_results" && mine) {
      const table = standings(await tapsFor(runId));
      lanes = table.length;
      place = table.find((l) => l.key === laneKey)?.place ?? null;
    }
    return { kind: "race", joined: mine !== null, lane, place, lanes };
  }

  if (game.kind === "survival") {
    const q = currentQuestion(stage);
    const [player, answered] = await Promise.all([
      getPlayer(runId, ctx.attendee.id),
      q === null ? Promise.resolve(null) : getAnswer(runId, ctx.attendee.id, q),
    ]);
    return { kind: "survival", joined: player !== null, outAt: player?.out_at_question ?? null, answered };
  }

  // The winner's own phone learns only once the LED reveals it (D280, D282). In a card round
  // the participant is called up when their reel stops, and learns the prize at the flip (D319).
  const spun = spinFacts(stage);
  const mine = !!spun?.winnerIds.includes(ctx.attendee.id);
  const prizeNo = spun?.prizeNo ?? null;
  const prize = prizeNo === null ? "a prize" : game.config.prizes[prizeNo]?.name ?? "a prize";
  if (mine && (stage.phase === "draw_reveal" || stage.phase === "draw_card_reveal")) return { kind: "draw", won: prize, up: false };
  if (mine && stage.phase === "draw_card_pick") return { kind: "draw", won: null, up: true };
  return { kind: "draw", won: null, up: false };
}
