import { playContext } from "@/features/games";
import {
  checkSpeed, checkTimeline, decodeTimeline, getPlayer, getRun, parseSubmitBody, qualifierView, rankOf, replay, reviewOf, submitRun,
} from "@/features/qualifier";
import { json } from "@/lib/http";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A finished slime run (D791, D795). The phone sends its keystroke timeline, never a score: the
 * server checks it (the run cap), replays it through the same engine from the run's own seed,
 * checks the speed of the letters the engine accepted (Ruling 17), and stores the score that
 * comes out; the database then judges the timing against its own clock (not before the replayed
 * end, not after the cap plus grace).
 * Answers `{ ok: false, reason }` for a run that cannot count (`invalid` for a body that isn't a
 * timeline or a timeline no hand could type), and on success the score, the best before it and
 * the page's fresh view.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!allow(`qsub:${token}`, 20, 60_000)) return json({ error: "Slow down a little." }, 429);
  const ctx = await playContext(token);
  if (!ctx) return json({ error: "This link does not open the game." }, 404);
  const { event, attendee } = ctx;

  const body = parseSubmitBody(await req.json().catch(() => null));
  if (!body) return json({ ok: false, reason: "invalid" }, 400);

  // The run must be this player's, in this event.
  const run = UUID.test(body.runId) ? await getRun(body.runId, attendee.id) : null;
  if (!run || run.event_id !== event.id) return json({ ok: false, reason: "refused" });

  const entries = decodeTimeline(body);
  if (checkTimeline(entries)) return json({ ok: false, reason: "invalid" });
  const replayed = replay(run.seed, entries);
  if ("refused" in replayed) return json({ ok: false, reason: "invalid" });
  const { letters, ...result } = replayed;
  if (checkSpeed(letters)) return json({ ok: false, reason: "invalid" });
  const review = reviewOf(entries);

  const prevBest = (await getPlayer(event.id, attendee.id))?.best_score ?? null;
  const said = await submitRun(run.id, attendee.id, { ...result, ...review, timeline: body, device: body.device });
  if (said !== "ok") return json({ ok: false, reason: said });

  const rank = await rankOf(event.id, attendee.id);
  const view = await qualifierView(ctx, Date.now(), { rank });
  return json({ ok: true, score: result.score, prevBest, view });
}
