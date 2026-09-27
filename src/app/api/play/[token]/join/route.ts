import { liveStage, playContext, runFor } from "@/lib/games/live";
import { phoneState } from "@/lib/games/phone-state";
import { joinRace, joinSurvival } from "@/lib/db/games";
import { laneKeyFor } from "@/lib/games/race";
import { json } from "@/lib/games/http";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Join the race or last one standing in its lobby (D264, D271). Answers with the fresh phone
 * state. The phone joins as itself (the attendee its token names), into the run on its own
 * event's stage, and only while that run's game is this event's game of the lobby's kind.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!allow(`join:${token}`, 30, 60_000)) return json({ error: "Too many requests." }, 429);
  const ctx = await playContext(token);
  if (!ctx) return json({ error: "This link does not open a game." }, 404);
  const now = Date.now();
  const { stage, game } = await liveStage(ctx.event.id, now);
  const runId = stage.run_id;
  const onStage = runId !== null && game !== null && stage.game_id === game.id;
  if (onStage && stage.phase === "race_lobby" && game.kind === "tap_race") {
    const run = await runFor(runId, ctx.event.id);
    if (!run || run.game_id !== game.id) return json({ error: "Joining has closed for this game." }, 409);
    await joinRace(runId, ctx.attendee.id, laneKeyFor(ctx.attendee, run.grouping));
  } else if (onStage && stage.phase === "survival_lobby" && game.kind === "survival") {
    await joinSurvival(runId, ctx.attendee.id);
  } else {
    return json({ error: "Joining has closed for this game." }, 409);
  }
  return json(await phoneState(ctx, null, now));
}
