"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshStandardMaterial, Object3D, type DirectionalLight, type Group } from "three";
import { FOG, FOG_DENSITY, HEMI_GROUND, HEMI_INTENSITY, HEMI_SKY, SKY, SUN, SUN_INTENSITY } from "../../game/palette";
import type { Quality } from "../../game/quality";
import { buildWorld, disposeWorld } from "./scenery";

/** Clouds wrap round past this |x|. */
const CLOUD_SPAN = 42;

/**
 * The low-poly pastel world (D793, mockup card A): faceted grass, gem-cut and cone trees,
 * lavender rocks, five-sided snow-capped mountains and faceted clouds. No path, no flowers, no
 * butterflies. Built once per quality into a handful of merged, vertex-coloured meshes (a few
 * draw calls, not a hundred). The same seed every time, so the world never changes between runs.
 */
export function World({ quality }: { quality: Quality }) {
  const built = useMemo(() => buildWorld(quality), [quality]);
  useEffect(() => () => disposeWorld(built), [built]);

  const material = useMemo(() => new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }), []);
  useEffect(() => () => material.dispose(), [material]);

  const sunTarget = useMemo(() => new Object3D(), []);
  const clouds = useRef<Group>(null);
  const sun = useRef<DirectionalLight>(null);
  const full = quality === "full";

  // The sun's shadow covers the field and its edges (set here, where the projection can be updated).
  useEffect(() => {
    const light = sun.current;
    if (!light) return;
    const s = light.shadow;
    s.mapSize.set(1024, 1024);
    s.bias = -0.0004;
    s.normalBias = 0.03;
    s.radius = 3;
    Object.assign(s.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 60 });
    s.camera.updateProjectionMatrix();
  }, []);

  useFrame((_, delta) => {
    const g = clouds.current;
    if (!g || !full) return; // lite (and reduced motion) keeps the sky still
    const dt = Math.min(delta, 0.1);
    g.children.forEach((c, i) => {
      const speed = built.clouds[i]?.speed ?? 0.2;
      c.position.x += speed * dt;
      if (c.position.x > CLOUD_SPAN) c.position.x -= CLOUD_SPAN * 2;
    });
  });

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fogExp2 attach="fog" args={[FOG, FOG_DENSITY]} />
      <hemisphereLight args={[HEMI_SKY, HEMI_GROUND, HEMI_INTENSITY]} />
      <primitive object={sunTarget} position={[0, 0, -10]} />
      <directionalLight ref={sun} position={[-8, 12, -4]} color={SUN} intensity={SUN_INTENSITY} target={sunTarget} castShadow={full} />
      <mesh geometry={built.ground} material={material} receiveShadow={full} />
      <mesh geometry={built.props} material={material} castShadow={full} receiveShadow={full} />
      <mesh geometry={built.mountains} material={material} />
      <group ref={clouds}>
        {built.clouds.map((c, i) => (
          <mesh key={i} geometry={c.geometry} material={material} position={[c.x, c.y, c.z]} />
        ))}
      </group>
    </>
  );
}
