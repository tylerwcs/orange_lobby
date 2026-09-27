"use client";
import type { DisplayState } from "@/lib/games/wire";
import type { Synth } from "@/lib/games/sound";
import { celebrationDelay } from "@/lib/games/views";
import { MAX_REELS } from "@/lib/games/layout";
import Stage3D from "./Stage3D";
import { ThemeBackdrop } from "./ThemeBackdrop";
import { Confetti3D } from "./Confetti3D";
import { SlotReels } from "./SlotReels";
import { Wheel } from "./Wheel";
import { CardTable } from "./CardTable";

/**
 * Everything the LED draws in 3D (D293), in the one canvas: the Theme background, the winner
 * confetti and, from later tasks, the draw scenes. Loaded with next/dynamic (ssr: false), so
 * three.js only ever reaches the display page.
 */
export default function Layer3D({ state, offset, synth, theme, onLost }: { state: DisplayState; offset: number; synth: Synth; theme: boolean; onLost: () => void }) {
  return (
    <Stage3D onLost={onLost}>
      {theme && <ThemeBackdrop colour={state.event.colour} />}
      <DrawScene3D state={state} offset={offset} synth={synth} />
      {celebrationDelay(state.stage.phase) !== null && (
        <Confetti3D key={state.stage.key} green={state.look.kind === "green"} delayMs={celebrationDelay(state.stage.phase) ?? 0} />
      )}
    </Stage3D>
  );
}

/** Which 3D draw scene is on (D313–D317). */
function DrawScene3D({ state, offset, synth }: { state: DisplayState; offset: number; synth: Synth }) {
  const s = state.stage;
  const d = state.draw;
  if (!d) return null;
  if (s.phase === "draw_spinning" && d.targets && d.spinMs && s.endsAt) {
    const wheel = d.format === "wheel" && !d.quick;
    if (!wheel && d.targets.length <= MAX_REELS) {
      return <SlotReels key={s.key} targets={d.targets} sample={d.sample} endsAt={s.endsAt} spinMs={d.spinMs} offset={offset} synth={synth} />;
    }
  }
  if (d.format === "wheel" && d.wheel && (s.phase === "draw_ready" || s.phase === "draw_spinning")) {
    const spin = s.phase === "draw_spinning" && !d.quick;
    return (
      <Wheel key={spin ? s.key : "resting"} people={d.wheel} targetId={spin ? d.targets?.[0]?.id ?? null : null}
        endsAt={spin ? s.endsAt : null} spinMs={spin ? d.spinMs : null} offset={offset} synth={synth} colour={state.event.colour} />
    );
  }
  if (d.cards && (s.phase === "draw_ready" || s.phase === "draw_card_pick" || s.phase === "draw_card_reveal")) {
    const revealing = s.phase === "draw_card_reveal";
    return <CardTable key={revealing ? s.key : "table"} cards={d.cards.slots} picked={d.cards.picked} revealing={revealing} synth={synth} colour={state.event.colour} />;
  }
  return null;
}
