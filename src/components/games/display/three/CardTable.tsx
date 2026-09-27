"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { CardView } from "@/lib/games/cards";
import type { Synth } from "@/lib/games/sound";
import { cardLayout, toWorld, type Box } from "@/lib/games/layout";
import { useFontReady } from "./textTexture";
import { useAnimating } from "./useAnimating";
import { useRemoteImage } from "./remoteImage";
import { CARD_DEPTH, cardBackTexture, cardGeometries, prizeFaceTexture, type CardGeometries } from "./cardFaces";

/** How much of a card that was not picked still shows while another card is revealed. */
const DIM_OPACITY = 0.35;
/** A dimmed card's material settings, fixed at construction (see `dim` in Card). */
const fadeFor = (dim: boolean) => (dim ? { transparent: true, opacity: DIM_OPACITY } : {});

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The reveal's timeline (D317), in ms from the flip phase starting: glow and lift, fly to the centre, flip. */
export const LIFT_MS = 500;
export const FLY_END_MS = 1300;
export const FLIP_END_MS = 2000;

/**
 * The card round's table (D317): the cards still face down, numbered, bobbing gently in their
 * fixed places; taken cards are gone. When `revealing`, card `picked` glows and lifts, flies to
 * the centre, grows and flips to show its prize, with a lift, a flip and a fanfare. Each card is
 * a rounded, two-sided card (polish D323): the numbered back (the game's card back picture, if
 * it has one) faces the room, and the prize face faces away until the flip.
 */
export function CardTable({ cards, picked, revealing, synth, colour, cardBack }: {
  cards: CardView[]; picked: number | null; revealing: boolean; synth: Synth; colour: string; cardBack: string | null;
}) {
  const boxes = cardLayout(cards.length);
  const ready = useFontReady();
  const backImg = useRemoteImage(cardBack);
  useAnimating(true, revealing ? 60 : 30);
  // Every card on a table is the same size, so they share one set of geometries, keyed on the
  // size's numbers rather than the fresh-every-render `boxes` array.
  const w = boxes[0]?.w ?? 0;
  const h = boxes[0]?.h ?? 0;
  const geo = useMemo(() => (w > 0 && h > 0 ? cardGeometries(w, h) : null), [w, h]);
  useEffect(() => () => { geo?.face.dispose(); geo?.edge.dispose(); }, [geo]);
  if (!geo) return null;
  return (
    <>
      {cards.map((c, i) => {
        const active = revealing && c.no === picked;
        if (c.taken && !active) return null;
        return <Card key={c.no} card={c} box={boxes[i]} geo={geo} active={active} dim={revealing && !active} ready={ready} synth={synth} colour={colour} backImg={backImg} />;
      })}
    </>
  );
}

function Card({ card, box, geo, active, dim, ready, synth, colour, backImg }: {
  card: CardView; box: Box; geo: CardGeometries; active: boolean; dim: boolean; ready: boolean; synth: Synth; colour: string; backImg: HTMLImageElement | null | undefined;
}) {
  const group = useRef<THREE.Group>(null);
  // Only a taken card carries a picture (cardsView's secrecy rule), so this is null for the rest.
  const prizeImg = useRemoteImage(card.image);
  // The LED re-polls every second and hands back a NEW `cards.slots` array — and so a new `card`
  // object — even when nothing about this card changed, so these memos are keyed on the primitive
  // values a texture actually depends on (card.no / card.prize / box size / colour / ready), not
  // on `card` or `box` themselves (the SlotReels/Wheel lesson, D293, D294). Otherwise a canvas
  // texture would be re-rasterised and re-uploaded to the GPU on every poll, for every card on
  // the table. The pictures are the one non-primitive key, and a stable one: useRemoteImage
  // caches by URL and hands back the very same element on every call, changing only when the
  // picture finishes loading, which is exactly when the texture should be redrawn with it.
  const back = useMemo(() => (ready ? cardBackTexture(box.w, box.h, card.no, colour, backImg) : null), [ready, card.no, box.w, box.h, colour, backImg]);
  const face = useMemo(() => (ready && card.prize ? prizeFaceTexture(box.w, box.h, card.prize, prizeImg) : null), [ready, card.prize, box.w, box.h, prizeImg]);
  // Two effects, not one keyed on both: `back` and `face` change independently (different memo
  // deps above), so a single combined effect would dispose the texture that DIDN'T just change
  // too, every time the other one did.
  useEffect(() => () => back?.dispose(), [back]);
  useEffect(() => () => face?.dispose(), [face]);
  // Rebuilt (as brand new material instances, never mutated) whenever `back`/`face` changes,
  // including null -> texture once the font loads and again once a picture arrives. This matters
  // in three 0.186: a material whose `.map` is set to a texture AFTER it already compiled (e.g. via
  // R3F's applyProps re-assigning `.map` on the SAME material instance) never gets its shader
  // recompiled — R3F does not set `needsUpdate` for a prop change — so a card that first rendered
  // before its texture existed would stay blank forever after. Passing `map` in the constructor's
  // parameter object instead (as here) always compiles a fresh material against its final map, so
  // there is no stale instance to worry about. See Wheel.tsx for the same bug from the mutation side.
  // `dim`: during a reveal the cards NOT picked fade back (fix round 1 for Part C, D323), so the
  // picked card and its caption own the moment. A table is keyed per phase in Layer3D (the reveal
  // mounts a fresh one), so `dim` never changes for a mounted card — but it is still a memo key,
  // so a material is always built with its final `transparent`/`opacity` rather than toggled
  // later (flipping `transparent` on a compiled material would need `needsUpdate`).
  // The rim: the event colour, glowing with the numbered side during the lift and fly.
  const glow = useMemo(() => new THREE.MeshStandardMaterial({ color: colour, emissive: new THREE.Color(colour), emissiveIntensity: 0, ...fadeFor(dim) }), [colour, dim]);
  useEffect(() => () => glow.dispose(), [glow]);
  // The numbered back is the face the room actually sees head-on during the lift and fly, so it
  // carries the glow (D317 "the chosen card glows"), driven with the same per-frame intensity
  // below; the thin rim alone is nearly edge-on and barely visible.
  // With a card back picture, the picture is also the glow's emissiveMap (fix round 1 for Part C,
  // D323): the glow then follows the picture's own light areas, so its dark lines and the badge's
  // number stay dark and crisp instead of the whole side washing orange. (Halving the glow instead
  // was tried on the ?test display at 1600×900: the number and dark lines still turned orange.)
  const backMat = useMemo(() => new THREE.MeshStandardMaterial(back
    ? { map: back, emissive: new THREE.Color(colour), emissiveIntensity: 0, ...(back.userData.picture === true ? { emissiveMap: back } : {}), ...fadeFor(dim) }
    : { color: colour, emissive: new THREE.Color(colour), emissiveIntensity: 0, ...fadeFor(dim) }), [back, colour, dim]);
  useEffect(() => () => backMat.dispose(), [backMat]);
  // Unlit and not tone-mapped: the prize face is the picture people are meant to see as it is, on
  // true white. Lit (MeshStandardMaterial) and through the canvas's ACES tone mapping, the white
  // read as a flat light grey (~218/255) and a prize picture's colours as washed out.
  const faceMat = useMemo(() => new THREE.MeshBasicMaterial(face ? { map: face, toneMapped: false } : { color: "#ffffff", toneMapped: false }), [face]);
  useEffect(() => () => faceMat.dispose(), [faceMat]);
  const [x, y] = toWorld(box.x, box.y);
  const start = useRef<number | null>(null);
  const played = useRef({ lift: false, flip: false, fanfare: false });
  const grow = Math.min(2.4, 560 / box.h);

  // eslint-disable-next-line react-hooks/immutability -- the standard R3F pattern: this frame callback mutates the memoized `glow` material's `.emissiveIntensity` below (a direct property, unlike ThemeBackdrop's nested `.uniforms.x.value`, so the linter also flags the callback itself); confined to display/three/.
  useFrame(({ clock }) => {
    const m = group.current;
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

  // Two rounded faces back to back with the thin rim between them (polish D323; it replaces a
  // box whose rounded-corner textures left black corners). Each face is one-sided and faces
  // outwards, so from any angle only the side turned towards the room draws, and nothing outside
  // the rounded outline exists to draw at all. The prize face is turned half a turn about y, so it
  // reads the right way round once the card has flipped.
  return (
    <group ref={group}>
      <mesh geometry={geo.edge} material={glow} />
      <mesh geometry={geo.face} material={backMat} position={[0, 0, CARD_DEPTH / 2]} />
      <mesh geometry={geo.face} material={faceMat} position={[0, 0, -CARD_DEPTH / 2]} rotation={[0, Math.PI, 0]} />
    </group>
  );
}
