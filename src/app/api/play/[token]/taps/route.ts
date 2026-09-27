import { liveStage, playContext } from "@/lib/games/live";
import { addTaps } from "@/lib/db/games";
import { raceWindow } from "@/lib/games/phase";
import { json } from "@/lib/games/http";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * A batch of taps, about once a second (D266). The database caps it, checks the window and
 * only counts a player who joined this run; this only refuses the obviously wrong. Results is
 * allowed through so the last batch, sent as the race ends, can land inside the 1.5 s grace.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!allow(`taps:${token}`, 180, 60_000)) return json({ accepted: 0 }, 429);
  const ctx = await playContext(token);
  if (!ctx) return json({ error: "This link does not open a game." }, 404);
  const body = (await req.json().catch(() => null)) as { n?: unknown } | null;
  const n = typeof body?.n === "number" && Number.isFinite(body.n) ? Math.min(Math.max(Math.floor(body.n), 0), 200) : 0;
  const { stage, game } = await liveStage(ctx.event.id, Date.now());
  const w = raceWindow(stage);
  const racing = game?.kind === "tap_race" && stage.game_id === game.id && (stage.phase === "race_live" || stage.phase === "race_results");
  if (n === 0 || !stage.run_id || !w || !racing) return json({ accepted: 0 });
  const accepted = await addTaps(stage.run_id, ctx.attendee.id, n, new Date(w.from).toISOString(), new Date(w.until).toISOString());
  return json({ accepted });
}
