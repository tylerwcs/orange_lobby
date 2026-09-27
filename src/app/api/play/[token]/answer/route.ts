import { forgetStage, liveStage, playContext } from "@/lib/games/live";
import { submitAnswer } from "@/lib/db/games";
import type { SurvivalGame } from "@/lib/games/config";
import { currentQuestion, questionDeadline } from "@/lib/games/phase";
import { json } from "@/lib/games/http";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

type Open = { game: SurvivalGame; runId: string; q: number };

/** The question the stage has open for answers, if it is `question`. The deadline is the database's to judge. */
async function openQuestion(eventId: string, question: unknown): Promise<Open | null> {
  const { stage, game } = await liveStage(eventId, Date.now());
  const q = currentQuestion(stage);
  if (
    game?.kind !== "survival" || stage.game_id !== game.id || stage.run_id === null || q === null || q !== question
    || questionDeadline(stage) === null || (stage.phase !== "survival_question" && stage.phase !== "survival_locked")
  ) return null;
  return { game, runId: stage.run_id, q };
}

/**
 * One answer per question, until the deadline plus 1.5 s (D272). The first answer counts. Only
 * the phone's own answer, to the question open on its own event's stage, in the run on stage,
 * from a player who joined that run and is still in. survival_answer decides on the database's
 * clock, serialised with the reveal, so an answer the reveal did not count is never taken.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!allow(`answer:${token}`, 60, 60_000)) return json({ ok: false, error: "Too many requests." }, 429);
  const ctx = await playContext(token);
  if (!ctx) return json({ ok: false, error: "This link does not open a game." }, 404);
  const body = (await req.json().catch(() => null)) as { question?: unknown; choice?: unknown } | null;
  // The stage is memoised for a second: a question the host opened a moment ago may not be in
  // it yet, so a mismatch is checked once more against a fresh read before it is refused.
  let open = await openQuestion(ctx.event.id, body?.question);
  if (!open) {
    forgetStage(ctx.event.id);
    open = await openQuestion(ctx.event.id, body?.question);
  }
  if (!open) return json({ ok: false, error: "Too late — answers are locked." }, 409);
  const { game, runId, q } = open;
  const optionCount = game.config.questions[q]?.options.length ?? 0;
  const choice = body?.choice;
  if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice >= optionCount) {
    return json({ ok: false, error: "Pick one of the options." }, 400);
  }
  const r = await submitAnswer(ctx.event.id, runId, ctx.attendee.id, q, choice);
  if (r.ok) return json({ ok: true, choice: r.choice });
  if (r.refused === "not_player") return json({ ok: false, error: "You're not in this game." }, 403);
  if (r.refused === "out") return json({ ok: false, error: "You're out — watch this one." }, 403);
  return json({ ok: false, error: "Too late — answers are locked." }, 409);
}
