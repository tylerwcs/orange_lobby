"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useAnimating } from "./useAnimating";

const vertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const fragment = /* glsl */ `
uniform float uTime;
uniform vec3 uColour;
varying vec2 vUv;
void main() {
  vec2 p = vUv - vec2(0.5, 0.42);
  p.x *= 1.7778;
  float r = length(p);
  float a = atan(p.y, p.x);
  float rays = pow(0.5 + 0.5 * sin(a * 14.0 + uTime * 0.18), 4.0) * smoothstep(1.3, 0.05, r) * 0.28;
  float glow = smoothstep(0.95, 0.0, r) * 0.35;
  float drift = 0.06 * sin(vUv.x * 5.0 + uTime * 0.21) * sin(vUv.y * 3.5 - uTime * 0.17);
  vec3 base = mix(uColour * 0.42, vec3(0.015), smoothstep(0.1, 1.15, r));
  gl_FragColor = vec4(base + uColour * (rays + glow + drift), 1.0);
}`;

/** The Theme background (D298): a slowly drifting gradient with soft rays in the event colour, at 30 fps (D294). */
export function ThemeBackdrop({ colour }: { colour: string }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColour: { value: new THREE.Color(colour) } },
    vertexShader: vertex,
    fragmentShader: fragment,
    depthWrite: false,
  }), [colour]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => {
    // eslint-disable-next-line react-hooks/immutability -- the standard R3F pattern: mutate a three.js uniform per frame instead of re-rendering; confined to display/three/.
    material.uniforms.uTime.value = clock.elapsedTime;
  });
  useAnimating(true, 30);
  return (
    <mesh renderOrder={-10} material={material}>
      <planeGeometry args={[1920, 1080]} />
    </mesh>
  );
}
