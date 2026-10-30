import { playContext } from "@/features/games";
import { WORDS_PER_RUN, drawWords, ghostsFor, ineligibility, phaseOf, settingsFor, startRun } from "@/features/qualifier";
import { json } from "@/lib/http";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Starts a run (D771). The server draws the words and fixes the start on its own clock: the
 * countdown ends at `startsAt`, and a submit is judged against that, never against anything the
 * phone says. Starting abandons the player's live run. Who may play and the window are checked
 * here so the refusal can say why; the database checks them again.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!allow(`qstart:${token}`, 20, 60_000)) return json({ error: "Slow down a little." }, 429);
  const ctx = await playContext(token);
  if (!ctx) return json({ error: "This link does not open the qualifier." }, 404);
  const { event, attendee } = ctx;
  const settings = await settingsFor(event.id);
  if (ineligibility(attendee, event.preview_attendee_id, settings?.excluded_categories ?? [])) {
    return json({ error: "This challenge isn't open to you." }, 403);
  }
  if (phaseOf(settings, Date.now()) !== "open") return json({ error: "The qualifier isn't open right now." }, 403);

  const words = drawWords(WORDS_PER_RUN);
  const started = await startRun(event.id, attendee.id, words);
  if ("refused" in started) {
    return json({ error: started.refused === "closed" ? "The qualifier isn't open right now." : "This challenge isn't open to you." }, 403);
  }
  const ghosts = await ghostsFor(event.id, attendee.id);
  return json({ runId: started.runId, startsAt: started.startsAt, serverNow: Date.now(), words, ghosts });
}
