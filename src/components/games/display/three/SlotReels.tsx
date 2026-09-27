"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { Person } from "@/lib/games/wire";
import type { Synth } from "@/lib/games/sound";
import { reelLayout, reelTimings, toWorld, type Box } from "@/lib/games/layout";
import { easeOutQuart } from "@/lib/games/wheel";
import { textTexture, useFontReady } from "./textTexture";
import { useAnimating } from "./useAnimating";

const FACES = 12;
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
  const timings = reelTimings(targets.length, endsAt, spinMs);
  useAnimating(true, 60);
  return (
    <>
      {targets.map((t, j) => (
        <Reel key={t.id} box={boxes[j]} target={t} names={sample.filter((p) => p.id !== t.id)}
          stopAt={timings[j].stopAt} spinMs={timings[j].spinMs} offset={offset} synth={synth} />
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
  const moved = useRef(false);

  // The poll gives fresh `target`/`names` objects every ~1 s even when the people they describe
  // haven't changed, so the texture memo below is keyed on ids, not those references — otherwise
  // every reel re-rasterises and re-uploads FACES canvases a second, mid-spin (D293, D294).
  const namesKey = names.map((p) => p.id).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed by id, not identity
  const stableTarget = useMemo(() => target, [target.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed by the id list, not identity
  const stableNames = useMemo(() => names, [namesKey]);

  const textures = useMemo(() => {
    if (!ready) return [];
    const size = Math.min(faceH * 0.55, 150);
    return Array.from({ length: FACES }, (_, i) => {
      const p = i === 0 ? stableTarget : stableNames.length ? stableNames[(i - 1) % stableNames.length] : stableTarget;
      return textTexture(box.w, faceH, [
        { text: p.first || p.initials, size, colour: "#ffffff" },
        { text: p.initials, size: size * 0.4, colour: "#ffffff", alpha: 0.7 },
      ], { background: i % 2 ? "#1c1c24" : "#262632" });
    });
  }, [ready, stableTarget, stableNames, box.w, faceH]);
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);

  const [x, y] = toWorld(box.x, box.y);
  // Clips each face to this reel's own window (D313): without it, a drum's side faces reach well
  // past the frame in front of it and two rows of reels cut through each other in the gap between
  // rows. Planes are in world space, matching the world x/y the reel is placed at.
  const clipPlanes = useMemo(() => {
    const xMin = x - box.w / 2, xMax = x + box.w / 2;
    const yMin = y - box.h / 2, yMax = y + box.h / 2;
    return [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -xMin),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), xMax),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -yMin),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), yMax),
    ];
  }, [x, y, box.w, box.h]);

  useFrame(() => {
    const g = drum.current;
    if (!g) return;
    const p = Math.min(1, Math.max(0, 1 - (stopAt - (Date.now() + offset)) / spinMs));
    // Face i sits at angle i·τ/FACES; turning the drum by θ brings face θ to the front, so whole
    // turns land face 0 — the winner — at the front.
    g.rotation.x = turns * TAU * easeOutQuart(p);
    if (p < 1) moved.current = true;
    // A reel that mounts already past its stopAt (the LED loading mid-spin, or a very short
    // "Not here" redraw) never actually moved, so it lands silently instead of clunking at once.
    if (p >= 1 && !landed.current) {
      landed.current = true;
      if (moved.current) synth.play("clunk");
    }
  });
  return (
    <group position={[x, y, -radius]}>
      <group ref={drum}>
        {textures.map((tex, i) => {
          const a = (i * TAU) / FACES;
          return (
            <mesh key={i} position={[0, radius * Math.sin(a), radius * Math.cos(a)]} rotation={[-a, 0, 0]}>
              <planeGeometry args={[box.w, faceH]} />
              <meshBasicMaterial map={tex} clippingPlanes={clipPlanes} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
