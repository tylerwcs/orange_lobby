"use client";
import { useMemo } from "react";
import { motion } from "motion/react";
import type { DisplayDraw } from "@/lib/games/wire";
import { Frame } from "./Frame";
import { Mosaic } from "./Mosaic";

/**
 * Mosaic elimination (D315): the whole frozen pool as tiles; each round, the tiles no longer
 * standing fade out in a seeded ripple (the D275 mosaic). Tiles already out stay dark. The
 * server sends only who stands this round, so the winners cannot be spotted early.
 */
export function MosaicDraw({ title, prize, mosaic, seed }: { title: string; prize: string | null; mosaic: NonNullable<DisplayDraw["mosaic"]>; seed: string }) {
  const dark = useMemo(() => {
    const standing = new Set(mosaic.survivorIds);
    return new Set(mosaic.people.filter((p) => !standing.has(p.id)).map((p) => p.id));
  }, [mosaic]);
  return (
    <Frame title={title} right={<span>Round {mosaic.round} <span className="text-4xl opacity-75">of {mosaic.rounds}</span></span>}>
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <span className="font-game text-4xl opacity-90">{prize ? `Drawing for ${prize}` : ""}</span>
          <motion.span key={mosaic.survivorIds.length} initial={{ scale: 1.5 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 12, delay: 2 }}
            className="font-game text-6xl tabular-nums text-white drop-shadow-[0_0_30px_var(--brand)]">{mosaic.survivorIds.length} left</motion.span>
        </div>
        <div className="min-h-0 flex-1">
          <Mosaic key={mosaic.round} people={mosaic.people} darkIds={dark} darken seed={`${seed}:${mosaic.round}`} height={820} />
        </div>
      </div>
    </Frame>
  );
}
