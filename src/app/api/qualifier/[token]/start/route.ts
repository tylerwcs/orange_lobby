import { randomInt } from "node:crypto";
import { playContext } from "@/features/games";
import { hasKinds, hoursState, ineligibility, klClock, phaseOf, settingsFor, startRun, type RunKind } from "@/features/qualifier";
import { json } from "@/lib/http";
import { allow } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** "It opens again at 12:00 pm." The same words the page prints (screen.ts) when the hours shut. */
const hoursError = (opensAt: number) => `The game is closed right now. It opens again at ${klClock(opensAt)}.`;

/**
 * Starts a slime run (D771, D795). The server picks the seed, which fixes every slime, word and
 * sentence the run will throw, and fixes the start on its own clock: the countdown ends at
 * `startsAt`, and a submit is judged against that, never against anything the phone says.
 * Starting abandons the player's live run. Who may play, the window and the play hours (D908)
 * are checked here so the refusal can say why; the database checks them again, and it alone
 * counts today's runs (D907).
 * The body may name the `kind` of run. An event with no daily limits has only official runs,
 * whatever is asked; so has a page loaded before this shipped, which sends no body.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
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
  const hours = hoursState(settings?.play_hours ?? null, Date.now());
  if (!hours.open) return json({ error: hoursError(hours.opensAt) }, 403);

  const body = (await req.json().catch(() => null)) as { kind?: unknown } | null;
  const kind: RunKind = hasKinds(settings) && body?.kind === "practice" ? "practice" : "official";

  // 0 to 2^31 - 1: the upper bound is exclusive, so the seed fits the column's int4.
  const seed = randomInt(0, 2 ** 31);
  const started = await startRun(event.id, attendee.id, seed, kind);
  // Read as soon as the run exists: the phone's clock offset is measured against it.
  const serverNow = Date.now();
  if ("refused" in started) {
    return json({ error: refusedText(started.refused, kind, settings), refused: started.refused }, 403);
  }
  return json({ runId: started.runId, startsAt: started.startsAt, serverNow, seed, kind });
}

function refusedText(
  refused: "closed" | "ineligible" | "hours" | "limit", kind: RunKind,
  settings: { official_per_day: number | null; play_hours: number[] | null } | null,
): string {
  switch (refused) {
    case "closed": return "The game isn't open right now.";
    case "ineligible": return "This game isn't open to you.";
    case "hours": {
      // The database's clock crossed the boundary a moment after ours.
      const h = hoursState(settings?.play_hours ?? null, Date.now());
      return h.open ? "The game is closed right now." : hoursError(h.opensAt);
    }
    case "limit":
      if (kind === "practice") return "You've used today's practice runs.";
      return (settings?.official_per_day ?? 1) > 1 ? "You've used today's official attempts." : "You've used today's official attempt.";
  }
}
