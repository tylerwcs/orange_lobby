"use client";
import type { DisplayState } from "@/lib/games/wire";
import type { Synth } from "@/lib/games/sound";
import { celebrationDelay, emptyCelebration, showKey } from "@/lib/games/views";
import { MAX_REELS } from "@/lib/games/layout";
import { QUICK_SPIN_MS } from "@/lib/games/phase";
import { WAITING_FACE } from "@/lib/games/cards";
import type { Person } from "@/lib/games/wire";
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
      {/* Keyed on showKey, so race results settling does not restart the confetti; none over an empty winner screen. */}
      {celebrationDelay(state.stage.phase) !== null && !emptyCelebration(state) && (
        <Confetti3D key={showKey(state.stage.key)} green={state.look.kind === "green"} delayMs={celebrationDelay(state.stage.phase) ?? 0} />
      )}
    </Stage3D>
  );
}

/** The waiting reel's props, module constants so no poll hands the reel new ones. */
const WAITING_REEL: Person[] = [WAITING_FACE];
const NO_NAMES: Person[] = [];

/** Which 3D draw scene is on (D313–D317). */
function DrawScene3D({ state, offset, synth }: { state: DisplayState; offset: number; synth: Synth }) {
  const s = state.stage;
  const d = state.draw;
  if (!d) return null;
  if (d.format === "cards" && d.cards) {
    // A card round (D317): the reel waits (still, "?" on every face — no one's name before a
    // spin; a constant key and face, so it never remounts as the pool changes), spins, and
    // stays landed on the participant until the host shows the cards; then the card table. The
    // spin and its landed reel share one key, so the reel stays mounted when it stops; the
    // participant is unique to that spin in the run (draw_spin never draws a standing or voided
    // winner again), and a fresh spin always follows the waiting reel's own key. A still reel is
    // given an end long past, so it shows the landed pose and never clunks (only a reel that
    // moved does).
    const left = d.cards.slots.some((c) => !c.taken);
    if (s.phase === "draw_ready") {
      return left
        ? <SlotReels key="waiting" still targets={WAITING_REEL} sample={NO_NAMES} endsAt={0} spinMs={QUICK_SPIN_MS} offset={offset} synth={synth} />
        : null;
    }
    const spin = d.targets?.length ? `turn:${d.targets.map((t) => t.id).join(",")}` : null;
    if (s.phase === "draw_spinning" && spin && d.targets && d.spinMs && s.endsAt && d.targets.length <= MAX_REELS) {
      return <SlotReels key={spin} targets={d.targets} sample={d.sample} endsAt={s.endsAt} spinMs={d.spinMs} offset={offset} synth={synth} />;
    }
    if (s.phase === "draw_card_landed" && spin && d.targets) {
      return <SlotReels key={spin} still targets={d.targets} sample={d.sample} endsAt={0} spinMs={d.spinMs ?? QUICK_SPIN_MS} offset={offset} synth={synth} />;
    }
    if (s.phase === "draw_card_pick" || s.phase === "draw_card_reveal") {
      const revealing = s.phase === "draw_card_reveal";
      return <CardTable key={revealing ? s.key : "table"} cards={d.cards.slots} picked={d.cards.picked} revealing={revealing} synth={synth} colour={state.event.colour} cardBack={d.cardBack} />;
    }
    return null;
  }
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
  return null;
}
