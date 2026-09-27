"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { CardView } from "@/lib/games/cards";
import type { Synth } from "@/lib/games/sound";
import { cardLayout, toWorld, type Box } from "@/lib/games/layout";
import { textTexture, useFontReady } from "./textTexture";
import { useAnimating } from "./useAnimating";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The reveal's timeline (D317), in ms from the flip phase starting: glow and lift, fly to the centre, flip. */
export const LIFT_MS = 500;
export const FLY_END_MS = 1300;
export const FLIP_END_MS = 2000;

/**
 * The card round's table (D317): the cards still face down, numbered, bobbing gently in their
 * fixed places; taken cards are gone. When `revealing`, card `picked` glows and lifts, flies to
 * the centre, grows and flips to show its prize, with a lift, a flip and a fanfare.
 */
export function CardTable({ cards, picked, revealing, synth, colour }: { cards: CardView[]; picked: number | null; revealing: boolean; synth: Synth; colour: string }) {
  const boxes = cardLayout(cards.length);
  const ready = useFontReady();
  useAnimating(true, revealing ? 60 : 30);
  return (
    <>
      {cards.map((c, i) => {
        const active = revealing && c.no === picked;
        if (c.taken && !active) return null;
        return <Card key={c.no} card={c} box={boxes[i]} active={active} ready={ready} synth={synth} colour={colour} />;
      })}
    </>
  );
}

function Card({ card, box, active, ready, synth, colour }: { card: CardView; box: Box; active: boolean; ready: boolean; synth: Synth; colour: string }) {
  const mesh = useRef<THREE.Mesh>(null);
  // The LED re-polls every second and hands back a NEW `cards.slots` array — and so a new `card`
  // object — even when nothing about this card changed, so these memos are keyed on the primitive
  // values a texture actually depends on (card.no / card.prize / box size / colour / ready), not
  // on `card` or `box` themselves (the SlotReels/Wheel lesson, D293, D294). Otherwise a canvas
  // texture would be re-rasterised and re-uploaded to the GPU on every poll, for every card on
  // the table.
  const back = useMemo(() => (ready ? textTexture(box.w, box.h, [
    { text: String(card.no), size: box.h * 0.42, colour: "#ffffff" },
  ], { background: colour, radius: 18 }) : null), [ready, card.no, box.w, box.h, colour]);
  const face = useMemo(() => (ready && card.prize ? textTexture(box.w, box.h, [
    { text: "YOU WIN", size: box.h * 0.09, colour: "#6b7280" },
    { text: card.prize, size: box.h * 0.17, colour: "#111827" },
  ], { background: "#ffffff", radius: 18 }) : null), [ready, card.prize, box.w, box.h]);
  // Two effects, not one keyed on both: `back` and `face` change independently (different memo
  // deps above), so a single combined effect would dispose the texture that DIDN'T just change
  // too, every time the other one did.
  useEffect(() => () => back?.dispose(), [back]);
  useEffect(() => () => face?.dispose(), [face]);
  // Rebuilt (as brand new material instances, never mutated) whenever `back`/`face` changes,
  // including null -> texture once the font loads. This matters in three 0.186: a material whose
  // `.map` is set to a texture AFTER it already compiled (e.g. via R3F's applyProps re-assigning
  // `.map` on the SAME material instance) never gets its shader recompiled — R3F does not set
  // `needsUpdate` for a prop change — so a card that first rendered before its texture existed
  // would stay blank forever after. Passing `map` in the constructor's parameter object instead
  // (as here) always compiles a fresh material against its final map, so there is no stale
  // instance to worry about. See Wheel.tsx for the same bug from the mutation side.
  // Split from the array below (rather than indexing into it) so the per-frame emissive mutation
  // targets a plain variable, the same shape as every other R3F per-frame material mutation in
  // this codebase (see ThemeBackdrop.tsx) instead of an array element.
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: colour, emissive: new THREE.Color(colour), emissiveIntensity: 0 }), [colour]);
  useEffect(() => () => glow.dispose(), [glow]);
  // The numbered back (+z) is the face the room actually sees head-on during the lift and fly, so
  // it gets the same emissive colour as the sides, driven with the same per-frame intensity below
  // (D317 "the chosen card glows") — the 10-unit sides alone are nearly edge-on and barely visible.
  const backMat = useMemo(() => new THREE.MeshStandardMaterial(back
    ? { map: back, emissive: new THREE.Color(colour), emissiveIntensity: 0 }
    : { color: colour, emissive: new THREE.Color(colour), emissiveIntensity: 0 }), [back, colour]);
  useEffect(() => () => backMat.dispose(), [backMat]);
  const faceMat = useMemo(() => new THREE.MeshStandardMaterial(face ? { map: face } : { color: "#ffffff" }), [face]);
  useEffect(() => () => faceMat.dispose(), [faceMat]);
  // BoxGeometry faces: +x, −x, +y, −y, +z (towards the room: the numbered back), −z (the prize).
  const materials = useMemo(() => [glow, glow, glow, glow, backMat, faceMat], [glow, backMat, faceMat]);
  const [x, y] = toWorld(box.x, box.y);
  const start = useRef<number | null>(null);
  const played = useRef({ lift: false, flip: false, fanfare: false });
  const grow = Math.min(2.4, 560 / box.h);

  // eslint-disable-next-line react-hooks/immutability -- the standard R3F pattern: this frame callback mutates the memoized `glow` material's `.emissiveIntensity` below (a direct property, unlike ThemeBackdrop's nested `.uniforms.x.value`, so the linter also flags the callback itself); confined to display/three/.
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    // `clock.elapsedTime` (real time since the canvas mounted), not an accumulated per-frame
    // `dt`: on the demand frameloop a hidden/idle tab can skip many frames, and elapsedTime still
    // gives a correct `e` on the next frame instead of drifting. `start` is captured on this
    // card's own first active frame, so a long gap BEFORE the reveal starts never affects it. A
    // long gap DURING the reveal (e.g. the tab was backgrounded mid-lift) can make `e` jump
    // straight past FLIP_END_MS on the very next frame: lift/fly/flip all clamp to 1, so the card
    // just jumps to its final flipped pose instead of animating through it, but each sound still
    // has its own `played` flag, so lift/flip/fanfare each still fire exactly once (possibly on
    // the same frame) rather than being skipped or repeated.
    const t = clock.elapsedTime * 1000;
    if (!active) {
      m.position.set(x, y + Math.sin(t / 700 + card.no) * 4, 0);
      m.rotation.set(0, 0, 0);
      m.scale.setScalar(1);
      return;
    }
    if (start.current === null) start.current = t;
    const e = t - start.current;
    const lift = clamp01(e / LIFT_MS);
    const fly = ease(clamp01((e - LIFT_MS) / (FLY_END_MS - LIFT_MS)));
    const flip = ease(clamp01((e - FLY_END_MS) / (FLIP_END_MS - FLY_END_MS)));
    m.position.set(x * (1 - fly), y * (1 - fly) - 30 * fly, 120 * lift + 80 * fly);
    m.rotation.set(0, Math.PI * flip, 0);
    m.scale.setScalar(1 + fly * (grow - 1));
    const glowIntensity = lift * (0.7 - 0.4 * flip) + 0.15 * Math.sin(e / 120) * lift;
    // eslint-disable-next-line react-hooks/immutability -- the standard R3F pattern: mutate a three.js material per frame instead of re-rendering; confined to display/three/.
    glow.emissiveIntensity = glowIntensity;
    // eslint-disable-next-line react-hooks/immutability -- same as `glow` above: the numbered back is the face actually visible during the lift/fly, so it carries the same glow, fading out as `flip` turns it away from the room.
    backMat.emissiveIntensity = glowIntensity;
    const p = played.current;
    if (!p.lift) { p.lift = true; synth.play("lift"); }
    if (e >= FLY_END_MS && !p.flip) { p.flip = true; synth.play("flip"); }
    if (e >= FLIP_END_MS && !p.fanfare) { p.fanfare = true; synth.play("fanfare"); }
  });

  return (
    <mesh ref={mesh} material={materials}>
      <boxGeometry args={[box.w, box.h, 10]} />
    </mesh>
  );
}
