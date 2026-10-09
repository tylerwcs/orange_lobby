"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Person } from "../../../wire";
import type { Synth } from "../../../sound";
import { canTick, easeOutQuart, landingAngle, sliceAt, WHEEL_NAMED_MAX } from "../../../wheel";
import { GAME_FAMILY, useFontReady } from "./textTexture";
import { useAnimating } from "./useAnimating";

const RADIUS = 440;

/**
 * The wheel's face: one slice per person, clockwise from the top (the pointer) to match sliceAt,
 * alternating shades of the event colour. Names only up to WHEEL_NAMED_MAX slices (D314).
 */
function wheelTexture(people: Person[], colour: string): THREE.CanvasTexture {
  const size = 2048;
  const c = size / 2;
  const r = c - 4;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const n = people.length;
  const step = (Math.PI * 2) / n;
  const base = new THREE.Color(colour);
  const shades = [
    base.clone().lerp(new THREE.Color("#ffffff"), 0.18),
    base.clone().lerp(new THREE.Color("#000000"), 0.3),
    base.clone().lerp(new THREE.Color("#000000"), 0.55),
  ].map((x) => `#${x.getHexString()}`);
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + i * step;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, r, a0, a0 + step);
    ctx.closePath();
    // An odd count would put two equal shades side by side at the seam: the last slice takes a third.
    ctx.fillStyle = n % 2 === 1 && i === n - 1 ? shades[2] : shades[i % 2];
    ctx.fill();
  }
  if (n <= WHEEL_NAMED_MAX) {
    const font = Math.max(20, Math.min(72, r * step * 0.5));
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${font}px ${GAME_FAMILY}`;
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(-Math.PI / 2 + (i + 0.5) * step);
      ctx.fillText(people[i].label, r - 36, 0, r * 0.72);
      ctx.restore();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * The wheel of names (D314): every eligible name, one slice each, tilted towards the room. With a
 * target it spins for the spin time and eases to a stop with the target under the pointer,
 * ticking as slices pass (at most 30 a second). Without one it rests (the ready screen).
 */
export function Wheel({ people, targetId, endsAt, spinMs, offset, synth, colour }: {
  people: Person[]; targetId: string | null; endsAt: number | null; spinMs: number | null; offset: number; synth: Synth; colour: string;
}) {
  const ready = useFontReady();
  const n = people.length;
  // The LED re-polls every second and each poll hands back a NEW `people`/`d.wheel` array and
  // object identities even when the pool hasn't actually changed, so keying the texture memo on
  // `people` itself would rebuild a 2048x2048 canvas texture every second (the SlotReels lesson,
  // D293, D294). Key on a stable id string instead — it still rebuilds when the set of people
  // (or their order) actually changes.
  const peopleKey = people.map((p) => p.id).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed by the id list, not identity
  const stablePeople = useMemo(() => people, [peopleKey]);
  const texture = useMemo(
    () => (ready && n > 0 ? wheelTexture(stablePeople, colour) : null),
    [ready, stablePeople, colour, n],
  );
  useEffect(() => () => texture?.dispose(), [texture]);
  const disc = useRef<THREE.Mesh>(null);
  const lastSlice = useRef(-1);
  const lastTick = useRef(0);
  // Derived from stablePeople (not the fresh-every-poll `people`) so the target index — and so
  // the landing angle below — cannot jump mid-spin just because a poll handed back new objects
  // for the same people.
  const target = targetId ? stablePeople.findIndex((p) => p.id === targetId) : -1;
  const spinning = target >= 0 && endsAt !== null && spinMs !== null && spinMs > 0;
  const turns = Math.max(4, Math.round((spinMs ?? 6000) / 1000));
  // Where in the slice the pointer ends: varied by target so stops do not all look alike.
  const total = spinning ? landingAngle(target, n, turns, 0.3 + 0.4 * (((target * 7919) % 100) / 100)) : 0;
  useAnimating(spinning, 60);
  useFrame(() => {
    const d = disc.current;
    if (!d || n === 0) return;
    let angle = 0;
    if (spinning) {
      const p = Math.min(1, Math.max(0, 1 - (endsAt! - (Date.now() + offset)) / spinMs!));
      angle = total * easeOutQuart(p);
    }
    d.rotation.z = -angle;
    const s = sliceAt(angle, n);
    if (spinning && s !== lastSlice.current) {
      lastSlice.current = s;
      const t = performance.now();
      if (canTick(lastTick.current, t)) {
        lastTick.current = t;
        synth.play("slice");
      }
    }
  });
  return (
    <group position={[0, -70, 0]} rotation={[-0.32, 0, 0]}>
      <mesh position={[0, 0, -6]}>
        <circleGeometry args={[RADIUS + 24, 128]} />
        <meshStandardMaterial color={colour} metalness={0.4} roughness={0.35} />
      </mesh>
      <mesh ref={disc}>
        <circleGeometry args={[RADIUS, 256]} />
        {/* `key` forces React Three Fiber to build a fresh material whenever `texture` changes
            (including null -> texture) instead of reusing the same instance and setting `.map`
            on it: three only recompiles a material's shader (the USE_MAP define) from its own
            `version`/`needsUpdate`, which applyProps never sets when assigning `.map`. A material
            that first compiled with `map: null` would keep running its no-map shader forever
            after, even once a texture arrives — a blank flat disc, not the textured one. This
            still happens on the wheel's very first mount ever on a page (`useFontReady`'s
            synchronous `document.fonts.check` only helps once the font has already loaded once;
            before that it still starts false and flips true a frame or two later), and on any
            later remount — including the one at every spin start (`key={spin ? s.key :
            "resting"}` in Layer3D) — if that remount's first frame happens to render before
            `useAnimating`'s invalidation catches up. Keying on the texture (or "flat" while there
            is none) sidesteps all of that: a genuinely new material always compiles against the
            map it is given. */}
        <meshBasicMaterial key={texture?.uuid ?? "flat"} map={texture} color={texture ? "#ffffff" : colour} />
      </mesh>
      <mesh position={[0, 0, 6]}>
        <circleGeometry args={[56, 64]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, RADIUS + 30, 24]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[30, 70, 3]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}
