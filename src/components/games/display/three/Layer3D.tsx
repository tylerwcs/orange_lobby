"use client";
import type { DisplayState } from "@/lib/games/wire";
import type { Synth } from "@/lib/games/sound";
import Stage3D from "./Stage3D";
import { ThemeBackdrop } from "./ThemeBackdrop";

/**
 * Everything the LED draws in 3D (D293), in the one canvas: the Theme background and, from later
 * tasks, the draw scenes and the winner confetti. Loaded with next/dynamic (ssr: false), so
 * three.js only ever reaches the display page.
 */
export default function Layer3D({ state, theme, onLost }: { state: DisplayState; offset: number; synth: Synth; theme: boolean; onLost: () => void }) {
  return (
    <Stage3D onLost={onLost}>
      {theme && <ThemeBackdrop colour={state.event.colour} />}
    </Stage3D>
  );
}
