// Draining the engine's events for the slime scene (D793, R11). Kept apart from the GL frame
// loop so a scene fault never stops the events, and a caller's fault never stops the scene.
import type { Game, GameEvent } from "../../game/engine";

/** Runs a caller's callback; a throw is logged, not passed on (a sound bug must not kill the scene). */
export function safely(fn: (() => void) | undefined): void {
  if (!fn) return;
  try {
    fn();
  } catch (e) {
    console.error(e);
  }
}

/**
 * Empties `game.events` and hands each event to `onEvent`; an `explode` also calls `onHit`. Each
 * call is guarded on its own. Returns the drained events for the scene's own effects.
 */
export function drainEvents(
  game: Game | null,
  on: { onEvent?: (e: GameEvent) => void; onHit?: () => void },
): GameEvent[] {
  if (!game || game.events.length === 0) return [];
  const events = game.events.splice(0);
  for (const e of events) {
    const { onEvent, onHit } = on;
    if (onEvent) safely(() => onEvent(e));
    if (e.type === "explode") safely(onHit);
  }
  return events;
}
