"use client";
import { useEffect, useRef } from "react";
import { Crown, Flame, Timer, Volume2, VolumeX } from "lucide-react";
import { FIRE, FIRE_HOT, HEALTH, HEALTH_TRACK, LABEL_INK, TITLE_INK, css } from "../../game/palette";
import { COMBO_MAX_MULT, multiplier } from "../../game/rules";

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
  /** The boss that is out: its words still to type of `total`, and whether it is the last. */
  boss: { left: number; total: number; final: boolean } | null;
};

/** 3:00, 0:09. */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** The last seconds, when the clock turns red and ticks. */
const HURRY_S = 10;

/** The bosses' names on their health bar (D816): a keynote at 1:30, the finale at 2:45. */
export const bossName = (final: boolean) => (final ? "The Grand Finale" : "The Keynote King");

/** Big lettering over the scene, outlined like the title. */
const SHOUT = { color: css(TITLE_INK), WebkitTextStroke: `5px ${css(LABEL_INK)}`, paintOrder: "stroke fill" } as const;

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The run's numbers over the slime scene (D794, D812, D816): score, combo with its multiplier, a
 * burst slime's lost points ("−150", in red, rising off the score), the time left and the mute
 * toggle along the top, with the boss's name and health bar under them while one is out; and at
 * the bottom (above the keyboard on a phone, where the eyes are while typing) the typing bar, as
 * typing games have it: the letters typed so far in strong ink, a blinking caret, the rest of the
 * word faded, and a wrong key in red, the bar turning red with a short shake.
 *
 * It celebrates too (D816): the score bounces as it goes up, "×3 COMBO!" bursts over the scene as
 * the multiplier rises, and at the top multiplier the player is on fire: a flame chip, the screen
 * edges and the typing bar glowing orange until a typo or a burst puts it out.
 *
 * The scene's sky is light whatever the theme, so every piece sits on a theme-coloured chip
 * (`bg-background/85`) that reads in both light and dark. Only the mute button takes taps.
 */
export function GameHud({ hud, muted, onMute }: { hud: HudState; muted: boolean; onMute(): void }) {
  const mult = multiplier(hud.combo);
  const fire = mult >= COMBO_MAX_MULT;
  // The chip without its ink, for the clock, which turns red at the end.
  const chipBox = "rounded-3xl bg-background/85 px-4 py-2.5 shadow-md backdrop-blur-sm";
  const chip = `${chipBox} text-foreground`;
  const bar = useRef<HTMLParagraphElement>(null);
  const loss = useRef<HTMLSpanElement>(null);
  const score = useRef<HTMLSpanElement>(null);
  const callout = useRef<HTMLParagraphElement>(null);
  const shown = useRef({ score: hud.score, mult });
  const hurry = hud.left <= HURRY_S;

  // A wrong key: a short shake (not with reduced motion; the red says it anyway).
  useEffect(() => {
    if (hud.misses === 0 || still()) return;
    bar.current?.animate?.(
      [{ transform: "translateX(0)" }, { transform: "translateX(-7px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }],
      { duration: 240, easing: "ease-out" },
    );
  }, [hud.misses]);

  // A slime burst: its lost points rise off the score and fade (only fade with reduced motion).
  useEffect(() => {
    if (hud.hits === 0) return;
    loss.current?.animate?.(
      still()
        ? [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }]
        : [{ opacity: 0, transform: "translateY(4px) scale(0.8)" }, { opacity: 1, transform: "translateY(0) scale(1.15)", offset: 0.15 },
          { opacity: 1, transform: "translateY(-6px) scale(1)", offset: 0.6 }, { opacity: 0, transform: "translateY(-18px) scale(1)" }],
      { duration: 1400, easing: "ease-out", fill: "both" },
    );
  }, [hud.hits]);

  // The score went up: a bounce. The multiplier went up: "×3 COMBO!" (or "ON FIRE!" at the top).
  useEffect(() => {
    const was = shown.current;
    shown.current = { score: hud.score, mult };
    if (still()) return;
    if (hud.score > was.score) {
      score.current?.animate?.(
        [{ transform: "scale(1)" }, { transform: "scale(1.18)", offset: 0.35 }, { transform: "scale(1)" }],
        { duration: 260, easing: "ease-out" },
      );
    }
    if (mult > was.mult && mult > 1) {
      callout.current?.animate?.(
        [
          { opacity: 0, transform: "translateY(16px) scale(0.5) rotate(-6deg)" },
          { opacity: 1, transform: "translateY(0) scale(1.15) rotate(-3deg)", offset: 0.2 },
          { opacity: 1, transform: "translateY(-4px) scale(1) rotate(-3deg)", offset: 0.75 },
          { opacity: 0, transform: "translateY(-24px) scale(0.95) rotate(-3deg)" },
        ],
        { duration: 1100, easing: "ease-out", fill: "both" },
      );
    }
  }, [hud.score, mult]);

  const typed = hud.word ? hud.word.slice(0, hud.typed) : "";
  const rest = hud.word ? hud.word.slice(hud.typed) : "";
  const flame = `linear-gradient(135deg, ${css(FIRE)}, ${css(FIRE_HOT)})`;
  return (
    <>
      {/* On fire: the screen's edges glow. */}
      {fire && (
        <div aria-hidden className="pointer-events-none absolute inset-0 motion-safe:animate-pulse"
          style={{ boxShadow: `inset 0 0 60px 12px ${css(FIRE, 0.55)}, inset 0 0 18px 4px ${css(FIRE_HOT, 0.45)}` }} />
      )}

      <div data-hud-top className="pointer-events-none absolute inset-x-0 top-0 p-3 font-game tabular-nums"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <div className="flex items-start justify-between gap-2">
          <div className={`${chip} relative flex flex-col leading-none`}>
            <span ref={score} className="origin-left text-4xl sm:text-5xl">{hud.score.toLocaleString("en")}</span>
            <span ref={loss} aria-hidden className="absolute left-full top-1 ml-2 whitespace-nowrap rounded-full bg-destructive px-2.5 py-1 text-2xl text-destructive-foreground opacity-0 shadow-md sm:text-3xl">
              −{hud.lost.toLocaleString("en")}
            </span>
            {fire ? (
              <span className="mt-1.5 flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-sm sm:text-base"
                style={{ background: flame, color: css(TITLE_INK) }} aria-label={`On fire: combo ${hud.combo}, times ${mult}`}>
                <Flame aria-hidden className="size-4 motion-safe:animate-bounce" />on fire ×{mult}
              </span>
            ) : (
              <span className="mt-1.5 text-sm text-muted-foreground sm:text-base" aria-label={`Combo ${hud.combo}, times ${mult}`}>
                combo {hud.combo}{mult > 1 && <span className="ml-1 text-primary">×{mult}</span>}
              </span>
            )}
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
        {hud.boss && (
          <div className={`${chip} mx-auto mt-2 w-full max-w-md px-4 py-2 animate-in fade-in slide-in-from-top-2 duration-300`}
            role="img" aria-label={`${bossName(hud.boss.final)}: ${hud.boss.left} of ${hud.boss.total} words left`}>
            <p className="flex items-center justify-center gap-1.5 text-lg leading-none sm:text-xl">
              <Crown aria-hidden className="size-5" style={{ color: css(HEALTH) }} />{bossName(hud.boss.final)}
            </p>
            <div className="relative mt-1.5 h-3.5 overflow-hidden rounded-full" style={{ background: css(HEALTH_TRACK) }}>
              <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${(hud.boss.left / hud.boss.total) * 100}%`, background: css(HEALTH) }} />
            </div>
          </div>
        )}
      </div>

      {/* "×3 COMBO!": shown only while it animates. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center font-game">
        <p ref={callout} className="text-5xl leading-none opacity-0 sm:text-7xl" style={SHOUT}>
          {fire ? "ON FIRE!" : `×${mult} COMBO!`}
        </p>
      </div>

      {(hud.word || hud.miss) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 font-game"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          <p ref={bar} aria-live="off"
            className={`${chip} flex items-center px-6 text-3xl tracking-wide ring-3 transition-shadow sm:text-4xl ${hud.miss ? "ring-destructive" : "ring-transparent"}`}
            style={fire && !hud.miss ? { boxShadow: `0 0 0 3px ${css(FIRE)}, 0 0 24px 4px ${css(FIRE, 0.6)}` } : undefined}>
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
