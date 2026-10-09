import type { Attendee } from "@/lib/types";
import { forgetStage, liveStage, playContext, runFor, phoneState, joinRace, joinSurvival, laneKeyFor, json } from "@/features/games";
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
  // The stage is memoised for a second: a lobby the host opened a moment ago may not be in it
  // yet, so a closed lobby is checked once more against a fresh read before it is refused.
  let joined = await tryJoin(ctx.event.id, ctx.attendee);
  if (!joined) {
    forgetStage(ctx.event.id);
    joined = await tryJoin(ctx.event.id, ctx.attendee);
  }
  if (!joined) return json({ error: "Joining has closed for this game." }, 409);
  return json(await phoneState(ctx, null, Date.now()));
}

/** Joins the lobby on stage, if there is one; false when joining is closed. */
async function tryJoin(eventId: string, attendee: Attendee): Promise<boolean> {
  const { stage, game } = await liveStage(eventId, Date.now());
  const runId = stage.run_id;
  const onStage = runId !== null && game !== null && stage.game_id === game.id;
  if (onStage && stage.phase === "race_lobby" && game.kind === "tap_race") {
    const run = await runFor(runId, eventId);
    if (!run || run.game_id !== game.id) return false;
    await joinRace(runId, attendee.id, laneKeyFor(attendee, run.grouping));
    return true;
  }
  if (onStage && stage.phase === "survival_lobby" && game.kind === "survival") {
    await joinSurvival(runId, attendee.id);
    return true;
  }
  return false;
}
