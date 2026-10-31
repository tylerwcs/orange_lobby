"use client";
import { useImperativeHandle, useRef, type Ref } from "react";
import { Color, MathUtils, type Group, type Mesh, type MeshStandardMaterial, type Object3D, type PerspectiveCamera, type Vector3 } from "three";
import { BLASTER, BLASTER_DARK, BLASTER_TRIM, FLASH, GLASS, HAND, SLIMES } from "../../game/palette";
import type { Quality } from "../../game/quality";

/**
 * The player's blaster (D793): a chunky toy slime gun in the lower right of the view, faceted
 * like the world. It follows the camera, kicks back on a pop (a little on each letter), shudders
 * on a wrong letter, and its tank glows the colour of the slime being typed.
 */

export type BlasterApi = {
  /** Follow the camera and animate. `look`: the locked slime's colour index, or null. */
  update(f: { t: number; dt: number; camera: PerspectiveCamera; quality: Quality; look: number | null }): void;
  /** A shot: full recoil and a muzzle flash (`strength` 0..1). */
  fire(strength: number): void;
  /** A letter landing: a small kick. */
  kick(amount: number): void;
  /** A wrong letter: a short sideways shudder. */
  jolt(): void;
  /** The muzzle in world space. */
  tip(out: Vector3): Vector3;
};

/** Gun scale, and its distance in front of the eye (m). */
const SCALE = 0.42;
const DEPTH = 0.55;

const trim = new Color(BLASTER_TRIM);
const want = new Color();

export function Blaster({ ref }: { ref?: Ref<BlasterApi> }) {
  const rig = useRef<Group>(null);
  const gun = useRef<Group>(null);
  const tipRef = useRef<Object3D>(null);
  const flash = useRef<Mesh>(null);
  const goo = useRef<MeshStandardMaterial>(null);
  const motion = useRef({ recoil: 0, jolt: 0, flash: 0 });

  useImperativeHandle(ref, () => ({
    update({ t, dt, camera, quality, look }) {
      const r = rig.current;
      const g = gun.current;
      if (!r || !g) return;
      const m = motion.current;
      r.position.copy(camera.position);
      r.quaternion.copy(camera.quaternion);
      r.updateMatrixWorld();

      // Lower right of whatever the view is: placed from the camera's frustum, so a narrow phone
      // view doesn't push the gun into the middle or off the edge.
      const halfH = DEPTH * Math.tan(MathUtils.degToRad(camera.fov / 2));
      const halfW = halfH * camera.aspect;
      const restX = Math.min(halfW * 0.5, halfW - 0.12);
      const restY = -halfH * 0.66;

      m.recoil = Math.max(0, m.recoil - dt * 6);
      m.jolt = Math.max(0, m.jolt - dt * 5);
      m.flash = Math.max(0, m.flash - dt * 12);
      const sway = quality === "full" ? 1 : 0;
      g.position.set(
        restX + Math.sin(t * 2) * 0.006 * sway,
        restY + Math.sin(t * 4) * 0.006 * sway + m.recoil * 0.03,
        -DEPTH + m.recoil * 0.1,
      );
      g.rotation.set(m.recoil * 0.3, 0.1, Math.sin(t * 55) * m.jolt * 0.09);

      const f = flash.current;
      if (f) {
        f.visible = m.flash > 0;
        f.scale.setScalar(0.4 + m.flash * 1.2);
      }
      const mat = goo.current;
      if (mat) {
        if (look === null) want.copy(trim);
        else want.setHex(SLIMES[look] ?? BLASTER_TRIM);
        mat.color.lerp(want, 1 - Math.exp(-dt * 10));
        mat.emissive.copy(mat.color);
      }
    },
    fire(strength) {
      const m = motion.current;
      m.recoil = Math.max(m.recoil, strength);
      m.flash = 1;
    },
    kick(amount) {
      const m = motion.current;
      m.recoil = Math.max(m.recoil, amount);
    },
    jolt() {
      motion.current.jolt = 1;
    },
    tip(out) {
      const t = tipRef.current;
      return t ? t.getWorldPosition(out) : out.set(0, 1.4, -0.5);
    },
  }), []);

  const hx = Math.PI / 2;
  return (
    <group ref={rig}>
      <group ref={gun} scale={SCALE}>
        {/* Body, with trim rings round the barrel. */}
        <mesh rotation-x={hx}>
          <capsuleGeometry args={[0.13, 0.5, 4, 10]} />
          <meshStandardMaterial color={BLASTER} flatShading roughness={0.55} />
        </mesh>
        <mesh position={[0, 0, -0.1]}>
          <torusGeometry args={[0.135, 0.032, 6, 12]} />
          <meshStandardMaterial color={BLASTER_TRIM} flatShading roughness={0.45} />
        </mesh>
        <mesh position={[0, 0, -0.25]}>
          <torusGeometry args={[0.13, 0.03, 6, 12]} />
          <meshStandardMaterial color={BLASTER_TRIM} flatShading roughness={0.45} />
        </mesh>
        {/* Flared nozzle. */}
        <mesh rotation-x={hx} position={[0, 0, -0.4]}>
          <cylinderGeometry args={[0.07, 0.105, 0.2, 10]} />
          <meshStandardMaterial color={BLASTER_TRIM} flatShading roughness={0.45} />
        </mesh>
        <mesh position={[0, 0, -0.5]}>
          <torusGeometry args={[0.07, 0.022, 6, 12]} />
          <meshStandardMaterial color={BLASTER_DARK} flatShading roughness={0.6} />
        </mesh>
        {/* Goo tank: glass round a glowing blob the colour of the locked slime. */}
        <mesh position={[0, 0.17, 0.05]}>
          <sphereGeometry args={[0.105, 12, 10]} />
          <meshStandardMaterial ref={goo} color={BLASTER_TRIM} emissive={BLASTER_TRIM} emissiveIntensity={0.35} flatShading roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.17, 0.05]}>
          <sphereGeometry args={[0.16, 12, 10]} />
          <meshStandardMaterial color={GLASS} transparent opacity={0.35} roughness={0.1} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.33, 0.05]}>
          <cylinderGeometry args={[0.05, 0.06, 0.05, 8]} />
          <meshStandardMaterial color={BLASTER_DARK} flatShading roughness={0.6} />
        </mesh>
        {/* Tail fin. */}
        <mesh position={[0, 0.15, 0.24]} rotation-x={-0.3}>
          <boxGeometry args={[0.035, 0.13, 0.16]} />
          <meshStandardMaterial color={BLASTER_TRIM} flatShading roughness={0.45} />
        </mesh>
        {/* Grip and the hand holding it. */}
        <mesh position={[0, -0.17, 0.12]} rotation-x={-0.35}>
          <capsuleGeometry args={[0.06, 0.16, 3, 8]} />
          <meshStandardMaterial color={BLASTER_DARK} flatShading roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.15, 0.17]} scale={[1.1, 1.2, 1.3]}>
          <sphereGeometry args={[0.1, 10, 8]} />
          <meshStandardMaterial color={HAND} flatShading roughness={0.7} />
        </mesh>
        <mesh position={[-0.085, -0.06, 0.1]}>
          <sphereGeometry args={[0.04, 8, 6]} />
          <meshStandardMaterial color={HAND} flatShading roughness={0.7} />
        </mesh>
        {/* Muzzle flash and the point shots leave from. */}
        <mesh ref={flash} position={[0, 0, -0.56]} visible={false}>
          <icosahedronGeometry args={[0.08, 0]} />
          <meshBasicMaterial color={FLASH} transparent opacity={0.9} />
        </mesh>
        <object3D ref={tipRef} position={[0, 0, -0.56]} />
      </group>
    </group>
  );
}
