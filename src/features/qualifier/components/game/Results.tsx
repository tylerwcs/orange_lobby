"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LABEL_INK, TITLE_INK, css } from "../../game/palette";
import { points } from "../../screen";
import { STAR_BONUS } from "../../game/rules";

/** What the player did in a run, for the results (D816). */
export type RunStats = {
  popped: number;
  bosses: number;
  bestCombo: number;
  /** Right letters of every letter typed, 0-100. */
  accuracy: number;
  /** Words a minute (five letters a word). */
  wpm: number;
  cleared: boolean;
  timeBonus: number;
  /** The bonus star was caught (D819). */
  star: boolean;
};

/** The stats from a finished run's counts. */
export function statsOf(g: { popped: number; bosses: number; stars: number; bestCombo: number; letters: number; misses: number; cleared: boolean; timeBonus: number }, endedMs: number): RunStats {
  const typed = g.letters + g.misses;
  return {
    popped: g.popped, bosses: g.bosses, bestCombo: g.bestCombo, cleared: g.cleared, timeBonus: g.timeBonus, star: g.stars > 0,
    accuracy: typed === 0 ? 0 : Math.round((g.letters / typed) * 100),
    wpm: endedMs <= 0 ? 0 : Math.round(g.letters / 5 / (endedMs / 60_000)),
  };
}

/** The score counting up over COUNT_MS (straight to it with reduced motion). */
const COUNT_MS = 1200;

/**
 * The results, over the meadow at dusk (D816): how the run ended, the score counting up, "New
 * best!", where the player stands, and four stats (slimes popped, best combo, accuracy, words a
 * minute). **Play again** starts the next run straight away (Enter too); **Back** returns to the
 * Games page. Where the event has practice and official runs (D909) there is no Play again
 * (`onPlayAgain` null): the next run is chosen on the page; a `practice` run says it is one.
 */
export function Results({ score, newBest, line, stats, practice = false, onPlayAgain, onBack }: {
  score: number; newBest: boolean; line: string; stats: RunStats; practice?: boolean; onPlayAgain: (() => void) | null; onBack(): void;
}) {
  const [shown, setShown] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      raf.current = requestAnimationFrame(() => setShown(score));
      return () => cancelAnimationFrame(raf.current);
    }
    const from = performance.now();
    // One clock throughout (not rAF's timestamp against performance.now), clamped to 0..1.
    const step = () => {
      const k = Math.min(1, Math.max(0, (performance.now() - from) / COUNT_MS));
      setShown(Math.round(score * (1 - (1 - k) ** 3)));
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [score]);

  const tiles: [string, string][] = [
    ["Slimes popped", String(stats.popped + stats.bosses + (stats.star ? 1 : 0))],
    ["Best combo", String(stats.bestCombo)],
    ["Accuracy", `${stats.accuracy}%`],
    ["Words a minute", String(stats.wpm)],
  ];
  return (
    <div className="pointer-events-auto flex w-full max-w-md flex-col items-center gap-4 rounded-3xl bg-background/90 p-5 text-center font-sans text-foreground shadow-lg backdrop-blur-sm animate-in fade-in zoom-in-95 duration-300 sm:p-6">
      <p className="font-game text-4xl leading-none sm:text-5xl"
        style={{ color: css(TITLE_INK), WebkitTextStroke: `4px ${css(LABEL_INK)}`, paintOrder: "stroke fill" }}>
        {stats.cleared ? "You beat the boss!" : "Time’s up!"}
      </p>
      <div className="flex flex-col items-center gap-1">
        {practice && <p className="font-game text-2xl leading-tight text-primary">Practice run</p>}
        {newBest && <p className="font-game text-2xl leading-tight text-primary motion-safe:animate-bounce">New best!</p>}
        <p className="font-game text-6xl leading-none tabular-nums sm:text-7xl" aria-label={`${points(score)} points`}>
          {points(shown)}<span className="ml-2 text-xl text-muted-foreground">points</span>
        </p>
        {stats.cleared && stats.timeBonus > 0 && (
          <p className="font-game text-lg text-primary tabular-nums">includes +{points(stats.timeBonus)} time bonus</p>
        )}
        {stats.star && <p className="font-game text-lg text-primary tabular-nums">★ Caught the bonus star: +{points(STAR_BONUS)}</p>}
      </div>
      <p className="font-game text-2xl leading-tight">{line}</p>
      <dl className="grid w-full grid-cols-2 gap-2">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-muted px-3 py-2">
            <dt className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
            <dd className="font-game text-3xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex w-full flex-col items-center gap-2">
        {onPlayAgain ? (
          <>
            <Button type="button" className="h-14 w-full max-w-xs rounded-full font-game text-2xl shadow-md" onClick={onPlayAgain}>Play again</Button>
            <span className="hidden text-xs text-muted-foreground pointer-fine:block">or press Enter</span>
            <Button type="button" variant="ghost" onClick={onBack}>Back to Games</Button>
          </>
        ) : (
          <Button type="button" className="h-14 w-full max-w-xs rounded-full font-game text-2xl shadow-md" onClick={onBack}>Back to Games</Button>
        )}
      </div>
    </div>
  );
}
