import { playContext } from "@/features/games";
import {
  getRun, markSeen, nearMiss, parseSubmission, qualifierView, getPlayer, rankOf, scoreRun, submitRun,
} from "@/features/qualifier";
import { json } from "@/lib/http";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A finished run (D771). The server recomputes the score from the words it gave this run and
 * the word times the phone reports, then the database judges the timing against its own clock
 * (30 s plus grace). The phone's own wpm is never read. Answers `{ ok: false, reason }` for a run
 * that cannot count, and on success the result line and the page's fresh view.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!allow(`qsub:${token}`, 20, 60_000)) return json({ error: "Slow down a little." }, 429);
  const ctx = await playContext(token);
  if (!ctx) return json({ error: "This link does not open the qualifier." }, 404);
  const { event, attendee } = ctx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const sub = parseSubmission(body);
  if (!sub || typeof body?.runId !== "string") return json({ error: "That result could not be read." }, 400);

  // The run must be this player's, in this event.
  const run = UUID.test(body.runId) ? await getRun(body.runId, attendee.id) : null;
  if (!run || run.event_id !== event.id) return json({ ok: false, reason: "refused" });

  const prevBest = (await getPlayer(event.id, attendee.id))?.best_wpm ?? null;
  const scored = scoreRun(run.words, sub);
  if ("refused" in scored) return json({ ok: false, reason: "refused" });

  const result = await submitRun(run.id, attendee.id, { ...scored, wordsDone: sub.wordsDone, offsets: sub.offsets, device: sub.device, multiInserts: sub.multiInserts });
  if (result !== "ok") return json({ ok: false, reason: result });

  // The new rank is the baseline for the next "you dropped" check (D771): a player's own climb
  // during a visit must not read as a fall later.
  const rank = await rankOf(event.id, attendee.id);
  await markSeen(event.id, attendee.id, rank);
  const view = await qualifierView(ctx, Date.now(), { rank });
  const line = nearMiss({ wpm: scored.wpm, prevBest, rank, cutWpm: view.cutWpm });
  return json({ ok: true, wpm: scored.wpm, accuracy: scored.accuracy, prevBest, line, view });
}
