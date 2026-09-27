"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import type { DisplayDraw } from "@/lib/games/wire";
import { Frame } from "./Frame";
import { Mosaic } from "./Mosaic";

/**
 * How long the D275 ripple takes to fade the newly-out tiles dark. The survivor count below waits
 * this long before switching to the new value, so the number does not spoil the round's outcome
 * before the tiles themselves have caught up.
 */
const RIPPLE_MS = 2000;

/**
 * Mosaic elimination (D315): the whole frozen pool as tiles; each round, the tiles no longer
 * standing fade out in a seeded ripple (the D275 mosaic). Tiles already out stay dark. The
 * server sends only who stands this round, so the winners cannot be spotted early.
 */
export function MosaicDraw({ prize, mosaic, seed }: { prize: string | null; mosaic: NonNullable<DisplayDraw["mosaic"]>; seed: string }) {
  const survivorsKey = mosaic.survivorIds.join(",");
  // The LED re-polls every second and hands back a NEW `mosaic` object identity even when the
  // round hasn't actually changed, so this is keyed on the round number and a joined id string
  // (the SlotReels/Wheel lesson, D293, D294), not on `mosaic` itself — otherwise up to ~500 tiles
  // would recompute their dark set, and Mosaic's own seeded delays, on every poll.
  const dark = useMemo(() => {
    const standing = new Set(mosaic.survivorIds);
    return new Set(mosaic.people.filter((p) => !standing.has(p.id)).map((p) => p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed by round + a joined survivorIds string, not `mosaic` itself; `mosaic.people` is the frozen pool for this draw and does not change within it.
  }, [mosaic.round, survivorsKey]);

  // The displayed count only switches once the ripple has had time to run (RIPPLE_MS), instead of
  // the instant a new round's data arrives — otherwise the number gives the round away before the
  // tiles do. `lastRound` guards the timeout so a same-round re-poll (a new `mosaic` object with
  // an unchanged round) never reschedules it.
  const [shown, setShown] = useState(mosaic.survivorIds.length);
  const lastRound = useRef(mosaic.round);
  useEffect(() => {
    if (lastRound.current === mosaic.round) return;
    lastRound.current = mosaic.round;
    const id = setTimeout(() => setShown(mosaic.survivorIds.length), RIPPLE_MS);
    return () => clearTimeout(id);
  }, [mosaic.round, mosaic.survivorIds.length]);

  // Round 0 is the whole pool before any round has run: nothing has been taken yet, so the
  // footer says how many are in the draw rather than "Round 0 of Y · N left".
  const footer = mosaic.round >= 1
    ? <span>Round {mosaic.round} <span className="opacity-75">of {mosaic.rounds}</span> · {shown} left</span>
    : <span>{mosaic.people.length} in the draw</span>;

  return (
    <Frame>
      <div className="flex h-full flex-col gap-4">
        {prize && <p className="text-center font-game text-4xl opacity-90">Drawing for {prize}</p>}
        <div className="min-h-0 flex-1">
          {/* No `key` here (unlike the brief's literal code): Mosaic must stay mounted across
              rounds so a tile going dark this round is a CSS class change on the SAME element,
              which is what lets `.mosaic-tile`'s `transition` (not `animation`) — and so each
              tile's seeded `transitionDelay` — actually run. Remounting per round instead gave
              every already-dark tile (from earlier rounds) no previous style to transition from,
              so the whole set just snapped straight to dark together: no ripple. */}
          <Mosaic people={mosaic.people} darkIds={dark} darken seed={`${seed}:${mosaic.round}`} height={780} />
        </div>
        {/* Centred under the tiles (Requirement 1), not a corner fact. */}
        <motion.p key={shown} initial={{ scale: 1.3 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 12 }}
          className="text-center font-game text-5xl tabular-nums text-white drop-shadow-[0_0_30px_var(--brand)]">{footer}</motion.p>
      </div>
    </Frame>
  );
}
