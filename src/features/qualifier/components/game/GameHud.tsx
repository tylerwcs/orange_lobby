"use client";
import { Heart, Volume2, VolumeX } from "lucide-react";
import { START_HEALTH, multiplier } from "../../game/rules";

export type HudState = {
  score: number;
  combo: number;
  health: number;
  /** The locked word and how many of its letters are typed; null with no lock. */
  word: string | null;
  typed: number;
};

/**
 * The run's numbers over the slime scene (D794): score, combo with its multiplier, the hearts,
 * the locked word's typed letters, and the mute toggle. The scene's sky is a fixed light pastel
 * whatever the theme, so every piece sits on a theme-coloured chip (`bg-background/80`) that
 * reads in both light and dark. Only the mute button takes taps.
 */
export function GameHud({ hud, muted, onMute }: { hud: HudState; muted: boolean; onMute(): void }) {
  const mult = multiplier(hud.combo);
  const chip = "rounded-2xl bg-background/80 px-3 py-1.5 text-foreground shadow-sm backdrop-blur-sm";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-3 font-game tabular-nums"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
      <div className="flex items-start justify-between gap-2">
        <div className={`${chip} flex flex-col leading-none`}>
          <span className="text-3xl">{hud.score.toLocaleString("en")}</span>
          <span className="mt-1 text-xs text-muted-foreground" aria-label={`Combo ${hud.combo}, times ${mult}`}>
            combo {hud.combo}{mult > 1 && <span className="ml-1 text-primary">×{mult}</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`${chip} flex items-center gap-1`} role="img" aria-label={`${hud.health} of ${START_HEALTH} health`}>
            {Array.from({ length: START_HEALTH }, (_, i) => (
              <Heart key={i} aria-hidden className={`size-5 ${i < hud.health ? "fill-destructive text-destructive" : "text-muted-foreground/50"}`} />
            ))}
          </div>
          <button type="button" onClick={onMute} aria-pressed={muted} aria-label={muted ? "Turn sound on" : "Turn sound off"}
            className={`${chip} pointer-events-auto flex size-10 items-center justify-center px-0`}>
            {muted ? <VolumeX aria-hidden className="size-5" /> : <Volume2 aria-hidden className="size-5" />}
          </button>
        </div>
      </div>
      {hud.word && (
        <p className={`${chip} self-center text-2xl tracking-wide`} aria-live="off">
          <span className="text-primary">{hud.word.slice(0, hud.typed)}</span>
          <span className="text-muted-foreground">{hud.word.slice(hud.typed)}</span>
        </p>
      )}
    </div>
  );
}
