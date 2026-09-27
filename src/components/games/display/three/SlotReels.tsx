"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Person } from "@/lib/games/wire";
import type { Synth } from "@/lib/games/sound";
import { reelLayout, toWorld, type Box } from "@/lib/games/layout";
import { easeOutQuart } from "@/lib/games/wheel";
import { textTexture, useFontReady } from "./textTexture";
import { useAnimating } from "./useAnimating";

const FACES = 12;
const STAGGER_MS = 350;
const TAU = Math.PI * 2;

/**
 * One reel per winner (D313): a drum of name faces that spins and eases to a stop with its winner
 * at the front, reels stopping left to right, the last exactly when the spin ends. A clunk as each
 * reel lands. The winners arrive with the spin (D312); the other faces are names from the pool.
 */
export function SlotReels({ targets, sample, endsAt, spinMs, offset, synth }: {
  targets: Person[]; sample: Person[]; endsAt: number; spinMs: number; offset: number; synth: Synth;
}) {
  const boxes = reelLayout(targets.length);
  const last = targets.length - 1;
  useAnimating(true, 60);
  return (
    <>
      {targets.map((t, j) => (
        <Reel key={t.id} box={boxes[j]} target={t} names={sample.filter((p) => p.id !== t.id)}
          stopAt={endsAt - (last - j) * STAGGER_MS} spinMs={Math.max(800, spinMs - (last - j) * STAGGER_MS)} offset={offset} synth={synth} />
      ))}
    </>
  );
}

function Reel({ box, target, names, stopAt, spinMs, offset, synth }: {
  box: Box; target: Person; names: Person[]; stopAt: number; spinMs: number; offset: number; synth: Synth;
}) {
  const ready = useFontReady();
  const faceH = box.h * 0.62;
  const radius = (faceH * FACES) / TAU;
  const turns = Math.max(3, Math.round(spinMs / 700));
  const drum = useRef<THREE.Group>(null);
  const landed = useRef(false);
  const textures = useMemo(() => {
    if (!ready) return [];
    const size = Math.min(faceH * 0.55, 150);
    return Array.from({ length: FACES }, (_, i) => {
      const p = i === 0 ? target : names.length ? names[(i - 1) % names.length] : target;
      return textTexture(box.w, faceH, [
        { text: p.first || p.initials, size, colour: "#ffffff" },
        { text: p.initials, size: size * 0.4, colour: "#ffffff", alpha: 0.7 },
      ], { background: i % 2 ? "#1c1c24" : "#262632" });
    });
  }, [ready, target, names, box.w, faceH]);
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);
  useFrame(() => {
    const g = drum.current;
    if (!g) return;
    const p = Math.min(1, Math.max(0, 1 - (stopAt - (Date.now() + offset)) / spinMs));
    // Face i sits at angle i·τ/FACES; turning the drum by θ brings face θ to the front, so whole
    // turns land face 0 — the winner — at the front.
    g.rotation.x = turns * TAU * easeOutQuart(p);
    if (p >= 1 && !landed.current) {
      landed.current = true;
      synth.play("clunk");
    }
  });
  const [x, y] = toWorld(box.x, box.y);
  return (
    <group position={[x, y, -radius]}>
      <group ref={drum}>
        {textures.map((tex, i) => {
          const a = (i * TAU) / FACES;
          return (
            <mesh key={i} position={[0, radius * Math.sin(a), radius * Math.cos(a)]} rotation={[-a, 0, 0]}>
              <planeGeometry args={[box.w, faceH]} />
              <meshBasicMaterial map={tex} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
