import { liveStage, playContext } from "@/lib/games/live";
import { getAnswer, getPlayer, recordAnswer } from "@/lib/db/games";
import { currentQuestion, questionDeadline } from "@/lib/games/phase";
import { answerAccepted } from "@/lib/games/survival";
import { json } from "@/lib/games/http";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * One answer per question, until the deadline plus 1.5 s (D272). The first answer counts. Only
 * the phone's own answer, to the question open on its own event's stage, in the run on stage,
 * from a player who joined that run and is still in.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!allow(`answer:${token}`, 60, 60_000)) return json({ ok: false, error: "Too many requests." }, 429);
  const ctx = await playContext(token);
  if (!ctx) return json({ ok: false, error: "This link does not open a game." }, 404);
  const body = (await req.json().catch(() => null)) as { question?: unknown; choice?: unknown } | null;
  const now = Date.now();
  const { stage, game } = await liveStage(ctx.event.id, now);
  const runId = stage.run_id;
  const q = currentQuestion(stage);
  const deadline = questionDeadline(stage);
  if (
    game?.kind !== "survival" || stage.game_id !== game.id || runId === null || q === null || q !== body?.question
    || deadline === null || (stage.phase !== "survival_question" && stage.phase !== "survival_locked")
    || !answerAccepted(deadline, now)
  ) {
    return json({ ok: false, error: "Too late — answers are locked." }, 409);
  }
  const optionCount = game.config.questions[q]?.options.length ?? 0;
  const choice = body?.choice;
  if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice >= optionCount) {
    return json({ ok: false, error: "Pick one of the options." }, 400);
  }
  const player = await getPlayer(runId, ctx.attendee.id);
  if (!player) return json({ ok: false, error: "You're not in this game." }, 403);
  if (player.out_at_question !== null) return json({ ok: false, error: "You're out — watch this one." }, 403);
  const first = await recordAnswer(runId, ctx.attendee.id, q, choice);
  return json({ ok: true, choice: first ? choice : await getAnswer(runId, ctx.attendee.id, q) });
}
