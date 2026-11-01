import { randomInt } from "node:crypto";
import { playContext } from "@/features/games";
import { ineligibility, phaseOf, settingsFor, startRun } from "@/features/qualifier";
import { json } from "@/lib/http";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Starts a slime run (D771, D795). The server picks the seed, which fixes every slime, word and
 * sentence the run will throw, and fixes the start on its own clock: the countdown ends at
 * `startsAt`, and a submit is judged against that, never against anything the phone says.
 * Starting abandons the player's live run. Who may play and the window are checked here so the
 * refusal can say why; the database checks them again.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!allow(`qstart:${token}`, 20, 60_000)) return json({ error: "Slow down a little." }, 429);
  const ctx = await playContext(token);
  if (!ctx) return json({ error: "This link does not open the game." }, 404);
  const { event, attendee } = ctx;
  const settings = await settingsFor(event.id);
  if (ineligibility({ ...attendee, cancelled_at: attendee.cancelled_at ?? null }, event.preview_attendee_id, settings?.excluded_categories ?? [])) {
    return json({ error: "This game isn't open to you." }, 403);
  }
  if (phaseOf(settings, Date.now()) !== "open") return json({ error: "The game isn't open right now." }, 403);

  // 0 to 2^31 - 1: the upper bound is exclusive, so the seed fits the column's int4.
  const seed = randomInt(0, 2 ** 31);
  const started = await startRun(event.id, attendee.id, seed);
  // Read as soon as the run exists: the phone's clock offset is measured against it.
  const serverNow = Date.now();
  if ("refused" in started) {
    return json({ error: started.refused === "closed" ? "The game isn't open right now." : "This game isn't open to you." }, 403);
  }
  return json({ runId: started.runId, startsAt: started.startsAt, serverNow, seed });
}
