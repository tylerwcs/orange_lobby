"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { confettiColours } from "@/lib/games/background";
import { stepPiece } from "@/lib/games/confetti";
import { useAnimating } from "./useAnimating";

const COUNT = 260;

// Fixed, index-based scatter: the same shower on every render and reload (no Math.random in render).
const PIECES = Array.from({ length: COUNT }, (_, i) => ({
  x: (((i * 373) % 1000) / 1000 - 0.5) * 1920,
  y: 560 + ((i * 617) % 1000) * 1.1,
  z: (i * 53) % 200,
  vy: 180 + ((i * 97) % 220),
  vx: (((i * 131) % 100) / 100 - 0.5) * 60,
  spin: 2 + ((i * 71) % 40) / 10,
  rx: (i * 0.7) % Math.PI,
  ry: (i * 1.3) % Math.PI,
}));

/**
 * Confetti for a winner screen (D305, D306): tumbling pieces over the whole canvas, starting
 * `delayMs` after it mounts; no green in green mode (D299). Remounted per stage key.
 */
export function Confetti3D({ green, delayMs = 0 }: { green: boolean; delayMs?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  // Mutated every frame, so a ref (not a memo): this mount's own copy of the scatter.
  const pieces = useRef(PIECES.map((p) => ({ ...p })));
  const colours = useMemo(() => confettiColours(green), [green]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const born = useRef<number | null>(null);
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const c = new THREE.Color();
    for (let i = 0; i < COUNT; i++) m.setColorAt(i, c.set(colours[i % colours.length]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [colours]);
  useAnimating(true, 60);
  useFrame(({ clock }, dt) => {
    const m = mesh.current;
    if (!m) return;
    if (born.current === null) born.current = clock.elapsedTime;
    const on = (clock.elapsedTime - born.current) * 1000 >= delayMs;
    pieces.current.forEach((p, i) => {
      if (on) stepPiece(p, dt);
      dummy.position.set(p.x, on ? p.y : 5000, p.z);
      dummy.rotation.set(p.rx, p.ry, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]}
      // While `delayMs` hasn't elapsed, every piece sits parked at y = 5000 (see below) so it's
      // invisible without needing its own on/off state. An InstancedMesh's automatic frustum
      // culling computes and CACHES a single bounding sphere from whatever the instance matrices
      // are on the first frame it's ever projected — with a delay, that's while every piece is
      // still parked at y = 5000, giving a sphere whose Y range (~4000+) the camera frustum can
      // never reach again, so the whole shower stays silently culled forever even once the pieces
      // fall back into view (found live: no confetti ever appeared after a card-round win, whose
      // 2 s delay guarantees at least one parked frame renders first — race/quiz winners have a
      // shorter or zero delay and mostly dodge it, which is why they looked fine). The shower is
      // meant to cover the whole 1920×1080 canvas outside the object's own tiny local origin
      // anyway, so culling it by that local bound was never correct; skip it.
      frustumCulled={false}>
      <planeGeometry args={[16, 26]} />
      <meshBasicMaterial side={THREE.DoubleSide} />
    </instancedMesh>
  );
}
