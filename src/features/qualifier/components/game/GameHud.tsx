"use client";
import { useEffect, useRef } from "react";
import { Timer, Volume2, VolumeX } from "lucide-react";
import { multiplier } from "../../game/rules";

export type HudState = {
  score: number;
  combo: number;
  /** Whole seconds left in the run (rounded up). */
  left: number;
  /** Points the last slime that burst took; `hits` counts them, so a new one shows again. */
  lost: number;
  hits: number;
  /** The locked word and how many of its letters are typed; null with no lock. */
  word: string | null;
  typed: number;
  /** The last key, when it was wrong (shown in red for a moment); null otherwise. */
  miss: string | null;
  /** Wrong keys so far: a new one shakes the typing bar again. */
  misses: number;
};

/** 3:00, 0:09. */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** The last seconds, when the clock turns red and ticks. */
const HURRY_S = 10;

/**
 * The run's numbers over the slime scene (D794, D812): score, combo with its multiplier, a burst
 * slime's lost points ("−150", in red, rising off the score), the time left and the mute toggle
 * along the top; and at the bottom (above the keyboard on a phone, where the eyes
 * are while typing) the typing bar, as typing games have it: the letters typed so far in strong
 * ink, a blinking caret, the rest of the word faded, and a wrong key in red, the bar turning red
 * with a short shake. The scene's sky is a fixed light pastel whatever the theme, so every piece
 * sits on a theme-coloured chip (`bg-background/85`) that reads in both light and dark. Only the
 * mute button takes taps.
 */
export function GameHud({ hud, muted, onMute }: { hud: HudState; muted: boolean; onMute(): void }) {
  const mult = multiplier(hud.combo);
  // The chip without its ink, for the clock, which turns red at the end.
  const chipBox = "rounded-3xl bg-background/85 px-4 py-2.5 shadow-md backdrop-blur-sm";
  const chip = `${chipBox} text-foreground`;
  const bar = useRef<HTMLParagraphElement>(null);
  const loss = useRef<HTMLSpanElement>(null);
  const hurry = hud.left <= HURRY_S;

  // A wrong key: a short shake (not with reduced motion; the red says it anyway).
  useEffect(() => {
    if (hud.misses === 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    bar.current?.animate?.(
      [{ transform: "translateX(0)" }, { transform: "translateX(-7px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }],
      { duration: 240, easing: "ease-out" },
    );
  }, [hud.misses]);

  // A slime burst: its lost points rise off the score and fade (only fade with reduced motion).
  useEffect(() => {
    if (hud.hits === 0) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    loss.current?.animate?.(
      still
        ? [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }]
        : [{ opacity: 0, transform: "translateY(4px) scale(0.8)" }, { opacity: 1, transform: "translateY(0) scale(1.15)", offset: 0.15 },
          { opacity: 1, transform: "translateY(-6px) scale(1)", offset: 0.6 }, { opacity: 0, transform: "translateY(-18px) scale(1)" }],
      { duration: 1400, easing: "ease-out", fill: "both" },
    );
  }, [hud.hits]);

  const typed = hud.word ? hud.word.slice(0, hud.typed) : "";
  const rest = hud.word ? hud.word.slice(hud.typed) : "";
  return (
    <>
      <div data-hud-top className="pointer-events-none absolute inset-x-0 top-0 p-3 font-game tabular-nums"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <div className="flex items-start justify-between gap-2">
          <div className={`${chip} relative flex flex-col leading-none`}>
            <span className="text-4xl sm:text-5xl">{hud.score.toLocaleString("en")}</span>
            <span ref={loss} aria-hidden className="absolute left-full top-1 ml-2 whitespace-nowrap rounded-full bg-destructive px-2.5 py-1 text-2xl text-destructive-foreground opacity-0 shadow-md sm:text-3xl">
              −{hud.lost.toLocaleString("en")}
            </span>
            <span className="mt-1.5 text-sm text-muted-foreground sm:text-base" aria-label={`Combo ${hud.combo}, times ${mult}`}>
              combo {hud.combo}{mult > 1 && <span className="ml-1 text-primary">×{mult}</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div role="timer" aria-label={`${clock(hud.left)} left`}
              className={`${chipBox} flex items-center gap-1.5 text-4xl leading-none sm:text-5xl ${hurry ? "text-destructive motion-safe:animate-pulse" : "text-foreground"}`}>
              <Timer aria-hidden className="size-7 sm:size-9" />
              {clock(hud.left)}
            </div>
            {/* Never takes the focus from the typing box: a phone's keyboard would close and reopen. */}
            <button type="button" onClick={onMute} aria-pressed={muted} aria-label={muted ? "Turn sound on" : "Turn sound off"}
              tabIndex={-1} onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()}
              className={`${chip} pointer-events-auto flex size-12 items-center justify-center px-0 py-0 sm:size-14`}>
              {muted ? <VolumeX aria-hidden className="size-6" /> : <Volume2 aria-hidden className="size-6" />}
            </button>
          </div>
        </div>
      </div>
      {(hud.word || hud.miss) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 font-game"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          <p ref={bar} aria-live="off"
            className={`${chip} flex items-center px-6 text-3xl tracking-wide ring-3 transition-shadow sm:text-4xl ${hud.miss ? "ring-destructive" : "ring-transparent"}`}>
            <span>{typed}</span>
            {hud.miss && <span className="text-destructive underline decoration-wavy decoration-2 underline-offset-4">{hud.miss}</span>}
            <span aria-hidden className="mx-px h-[1em] w-[3px] rounded-full bg-primary motion-safe:animate-pulse" />
            <span className="text-muted-foreground/60">{rest}</span>
          </p>
        </div>
      )}
    </>
  );
}
