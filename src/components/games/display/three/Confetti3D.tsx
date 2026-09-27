"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { confettiColours } from "@/lib/games/background";
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
      if (on) {
        p.y -= p.vy * dt;
        p.x += p.vx * dt;
        p.rx += p.spin * dt;
        p.ry += p.spin * 0.7 * dt;
        if (p.y < -600) p.y += 1300;
      }
      dummy.position.set(p.x, on ? p.y : 5000, p.z);
      dummy.rotation.set(p.rx, p.ry, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]}>
      <planeGeometry args={[16, 26]} />
      <meshBasicMaterial side={THREE.DoubleSide} />
    </instancedMesh>
  );
}
