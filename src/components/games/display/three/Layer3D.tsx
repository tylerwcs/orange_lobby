"use client";
import type { DisplayState } from "@/lib/games/wire";
import type { Synth } from "@/lib/games/sound";
import { celebrationDelay } from "@/lib/games/views";
import Stage3D from "./Stage3D";
import { ThemeBackdrop } from "./ThemeBackdrop";
import { Confetti3D } from "./Confetti3D";

/**
 * Everything the LED draws in 3D (D293), in the one canvas: the Theme background, the winner
 * confetti and, from later tasks, the draw scenes. Loaded with next/dynamic (ssr: false), so
 * three.js only ever reaches the display page.
 */
export default function Layer3D({ state, theme, onLost }: { state: DisplayState; offset: number; synth: Synth; theme: boolean; onLost: () => void }) {
  return (
    <Stage3D onLost={onLost}>
      {theme && <ThemeBackdrop colour={state.event.colour} />}
      {celebrationDelay(state.stage.phase) !== null && (
        <Confetti3D key={state.stage.key} green={state.look.kind === "green"} delayMs={celebrationDelay(state.stage.phase) ?? 0} />
      )}
    </Stage3D>
  );
}
