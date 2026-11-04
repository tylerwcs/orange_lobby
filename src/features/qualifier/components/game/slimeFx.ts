// The slimes' views and effects (D793), apart from React so a run can be checked in node.
// Imperative three.js, driven once a frame by the scene; the Game is only read. Rendering code:
// trig, floats and Math.random are fine here (only the engine must be deterministic).
import {
  AnimationMixer, CircleGeometry, Color, CylinderGeometry, Group, IcosahedronGeometry, InstancedMesh, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, Vector3, type AnimationAction,
  type BufferGeometry, type Camera, type Material, type SkinnedMesh,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { speedOf, type Game, type GameEvent, type Slime } from "../../game/engine";
import { BLASTER_TRIM, CROWN_GOLD, HORN, PUPIL, SHADOW, SLIMES, SLIME_SHADE, STAR, TEETH, TONGUE, WARN, slimeColour } from "../../game/palette";
import type { Quality } from "../../game/quality";
import { STICK_MS, TICK_MS } from "../../game/rules";
import type { SlimeModel } from "./slimeModel";

export type SceneFrame = {
  /** Render clock, s (animation only). */
  t: number;
  /** This frame's length, s (capped). */
  dt: number;
  /** The run clock, ms, possibly fractional: between engine ticks it extrapolates the slimes. */
  runMs: number;
  game: Game;
  quality: Quality;
  camera: Camera;
  /** The blaster's muzzle in world space, where shots start. */
  tip: Vector3;
};

/** Where a slime's word label hangs, in world space; `d` the slime's real distance in m. */
export type Head = { x: number; y: number; z: number; d: number };

const DEG = Math.PI / 180;
/**
 * The model (slimeModel.ts) is 1.44 m wide, 1.48 m tall and 1.62 m to its horn tips; scaled by
 * this, a size-1 slime's body is 1.14 m tall, as the drawn jelly was (any bigger and a stuck one
 * hides the field). Its armature is scaled 100, so a bone's translation × MODEL_RAW ×
 * MODEL_SCALE is metres.
 */
const MODEL_SCALE = 0.77;
const MODEL_RAW = 100;
/**
 * A size-1 slime's body, in its own space: an ellipsoid round the middle of the body, BODY_R
 * across and deep, BODY_R × BODY_SY high, BODY_Y off the ground. The horns stick out sideways,
 * never forwards, so the hull is what can come at the camera.
 */
export const BODY_Y = 0.57;
export const BODY_R = 0.56;
export const BODY_SY = 1.02;
/** The horn tips at rest. */
const TOP = 1.25;
/** How high the Jump clip lifts a slime, and the boss's Walk, m at size 1: the label sits above it. */
const JUMP_LIFT = 0.45;
const WALK_LIFT = 0.26;
const BOSS_SIZE = 2.6;
/** Seconds: the bubble shot's flight, which is also the squish before the burst. */
const SHOT_S = 0.13;
const MAX_DROPS = 260;
const MAX_PUDDLES = 14;
const PUDDLE_S = 2.6;
const GRAVITY = 14;
/** The boss falls in from the sky over this long, then lands with a thump. */
export const BOSS_DROP_S = 0.7;

/** A stable 0..1 from a slime id and a salt: sizes and hop timing. Visual only. */
const hash01 = (id: number, salt: number) => {
  const v = Math.sin(id * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutBack = (k: number) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;

const sizeOf = (s: Slime) => (s.kind === "boss" ? BOSS_SIZE : s.kind === "star" ? 0.9 : 0.85 + hash01(s.id, 1) * 0.3);
/** The star's glitter: a few gold drops off it this often, s. */
const SPARKLE_S = 0.12;
/** How much a stuck slime has swelled when its 3 s run out. */
const SWELL = 0.3;
/** A stuck slime's squash never goes below this, so its body is never wider than 1/√0.76 ≈ 1.15 × its radius. */
const MIN_SQUASH = 0.76;
const WIDEST = 1 / Math.sqrt(MIN_SQUASH);
/**
 * Space kept between the camera and the nearest a slime's skin can come, m: far enough that a
 * stuck slime (about 3.8 m off, a boss 5.2 m) leaves the field in view.
 */
const CLEARANCE = 3;
/**
 * Where a stuck slime ends up: its body fully swelled and at its widest wobble still `CLEARANCE`
 * clear of the camera (the camera is then outside it whatever its height, boss included).
 */
const stuckEndDist = (size: number) => BODY_R * size * (1 + SWELL) * WIDEST + CLEARANCE;
/** Where a slime stops as its 3 s start: a little farther out, so it can creep in while it swells. */
const stickDist = (size: number) => stuckEndDist(size) * 1.18;
/**
 * World distance for a real distance `d` (m). Exactly `d` until a few metres past `stickDist`,
 * then eased onto it, so a slime arrives there as its 3 s start instead of coming on at the camera.
 */
function visualDist(d: number, size: number, boss: boolean): number {
  const near = stickDist(size);
  const ramp = near + (boss ? 6 : 4);
  return d >= ramp ? d : near + (d * (ramp - near)) / ramp;
}

// ---------------------------------------------------------------------------------------------
// Shared geometry and materials, made once per quality.

type Kit = {
  quality: Quality;
  model: SlimeModel;
  geo: Record<"shadow" | "band" | "spike" | "drop" | "puddle" | "shot", BufferGeometry>;
  /** The darker underside, one per colour in SLIMES. */
  shade: Map<number, MeshStandardMaterial>;
  /** The model's other parts, by its material names. */
  parts: Record<"Eyes" | "Horns" | "Teeth" | "Tongue", MeshStandardMaterial>;
  shadow: MeshBasicMaterial;
  gold: MeshStandardMaterial;
  drop: MeshStandardMaterial;
  shot: MeshStandardMaterial;
  /** Droplets in flight, for every slime at once: one draw call. */
  drops: InstancedMesh;
};

function makeKit(quality: Quality, model: SlimeModel): Kit {
  const full = quality === "full";
  const puddle = new CircleGeometry(1, 12);
  puddle.rotateX(-Math.PI / 2);
  const shadow = new CircleGeometry(0.65, 20);
  shadow.rotateX(-Math.PI / 2);
  const geo: Kit["geo"] = {
    shadow,
    band: new CylinderGeometry(0.3, 0.27, 0.16, 5, 1, true),
    spike: new IcosahedronGeometry(0.07, 0),
    drop: new IcosahedronGeometry(1, 0),
    puddle,
    shot: new IcosahedronGeometry(0.075, 1),
  };
  const drop = new MeshStandardMaterial({ flatShading: true, roughness: 0.35 });
  const drops = new InstancedMesh(geo.drop, drop, MAX_DROPS);
  drops.frustumCulled = false; // the drops fly all over: their bounds are not the mesh's own
  const parked = new Object3D();
  parked.scale.setScalar(0);
  parked.updateMatrix();
  const white = new Color(0xffffff);
  for (let i = 0; i < MAX_DROPS; i++) {
    drops.setMatrixAt(i, parked.matrix);
    drops.setColorAt(i, white);
  }
  const matte = (color: number, roughness = 0.6) => new MeshStandardMaterial({ color, roughness });
  return {
    quality,
    model,
    geo,
    shade: new Map([...SLIMES, STAR].map((c) => [c, matte(new Color(c).multiplyScalar(SLIME_SHADE).getHex(), 0.55)])),
    parts: { Eyes: new MeshStandardMaterial({ color: PUPIL, roughness: 0.2 }), Horns: matte(HORN), Teeth: matte(TEETH, 0.4), Tongue: matte(TONGUE, 0.5) },
    shadow: new MeshBasicMaterial({ color: SHADOW, transparent: true, opacity: full ? 0.12 : 0.2, depthWrite: false }),
    gold: new MeshStandardMaterial({ color: CROWN_GOLD, flatShading: true, roughness: 0.35, metalness: 0.3 }),
    drop,
    shot: new MeshStandardMaterial({ color: BLASTER_TRIM, roughness: 0.25, emissive: BLASTER_TRIM, emissiveIntensity: 0.35 }),
    drops,
  };
}

function disposeKit(k: Kit) {
  // The model's geometry belongs to the loaded model (kept for the page), not to the kit.
  Object.values(k.geo).forEach((g) => g.dispose());
  [...k.shade.values(), ...Object.values(k.parts), k.shadow, k.gold, k.drop, k.shot].forEach((m) => m.dispose());
  k.drops.dispose();
}

/** A slime's glossy skin, one per slime (its warning pulse is its own). */
function skinMaterial(k: Kit, color: number): MeshStandardMaterial {
  const base = { color, roughness: 0.32, emissive: color, emissiveIntensity: 0.08 };
  return k.quality === "full"
    ? new MeshPhysicalMaterial({ ...base, clearcoat: 0.8, clearcoatRoughness: 0.2 })
    : new MeshStandardMaterial(base);
}

// ---------------------------------------------------------------------------------------------
// One slime on screen.

type Clip = keyof SlimeModel["clips"];

type View = {
  id: number;
  boss: boolean;
  /** The bonus star (D819): gold, glowing and glittering. */
  star: boolean;
  /** Render time of its next glitter. */
  sparkleAt: number;
  color: number;
  size: number;
  root: Group;
  /** Squash, hop and wobble; the model inside it. */
  body: Group;
  model: Group;
  shadow: Mesh;
  skin: MeshStandardMaterial;
  mixer: AnimationMixer;
  actions: Record<Clip, AnimationAction>;
  /** The armature's Body bone, whose lift the shadow follows. */
  bodyBone: Object3D | null;
  /** Loop period (s), phase (0..1), and the lift the label sits above. */
  period: number;
  phase: number;
  hop: number;
  /** A letter or word landing: 1, then dying away. */
  jiggle: number;
  /**
   * While stuck: how far into the bite clip (s), and the wobble's and the warning pulse's phases
   * (rad). Each advances by this frame's dt × its rate, never `t × rate`: a rate that rises
   * through the 3 s would otherwise jump the phase by t × the change, a jitter that grows with
   * the run's length.
   */
  biteS: number;
  wobble: number;
  warnPh: number;
  /** The slime the engine still has, or null once it's gone (popping). */
  slime: Slime | null;
  /** Render time the pop began. */
  poppedAt: number | null;
  /** Total scale last frame (size × swell). */
  scale: number;
};

function mesh(geo: BufferGeometry, mat: Material, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx): Mesh {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
}

function makeView(k: Kit, s: Slime): View {
  const boss = s.kind === "boss";
  const star = s.kind === "star";
  const color = star ? STAR : slimeColour(s.look, s.id);
  const skin = skinMaterial(k, color);
  const model = cloneSkinned(k.model.scene) as Group;
  model.scale.setScalar(MODEL_SCALE);
  model.traverse((o) => {
    const m = o as SkinnedMesh;
    if (!m.isMesh) return;
    const name = (m.material as Material).name;
    m.material = name === "Main" ? skin : name === "Main_Dark" ? k.shade.get(color)! : k.parts[name as keyof Kit["parts"]] ?? skin;
    m.castShadow = k.quality === "full";
  });
  const mixer = new AnimationMixer(model);
  const actions = {
    jump: mixer.clipAction(k.model.clips.jump),
    walk: mixer.clipAction(k.model.clips.walk),
    bite: mixer.clipAction(k.model.clips.bite),
  };
  Object.values(actions).forEach((a) => {
    a.setEffectiveWeight(0);
    a.play();
  });
  const body = new Group();
  body.add(model);
  if (boss) {
    // A little gold crown, tipped to one side, riding the head bone so it moves with the head.
    const crown = new Group();
    crown.add(mesh(k.geo.band, k.gold, 0, 0, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      crown.add(mesh(k.geo.spike, k.gold, Math.sin(a) * 0.28, 0.12, Math.cos(a) * 0.28, 1, 1.6, 1));
    }
    crown.rotation.z = -0.18;
    const head = model.getObjectByName("Head");
    if (head) {
      // The Head bone's axes are the model's; its units are the armature's (× MODEL_RAW).
      crown.position.set(0.0005, 0.0096, 0.0005);
      crown.scale.setScalar(1 / (MODEL_RAW * MODEL_SCALE));
      head.add(crown);
    } else {
      crown.position.set(0.05, 1.12, 0);
      body.add(crown);
    }
  }
  const shadow = mesh(k.geo.shadow, k.shadow, 0, 0.02, 0);
  const root = new Group();
  root.add(body, shadow);
  return {
    id: s.id, boss, star, sparkleAt: 0, color, size: sizeOf(s), root, body, model, shadow, skin, mixer, actions,
    bodyBone: model.getObjectByName("Body") ?? null,
    period: boss ? 1.5 : star ? 0.45 : 0.62 + hash01(s.id, 2) * 0.22,
    phase: hash01(s.id, 3),
    hop: boss ? WALK_LIFT : JUMP_LIFT,
    jiggle: 0, biteS: 0, wobble: 0, warnPh: 0, slime: s, poppedAt: null, scale: 1,
  };
}

/** Holds the view in one clip at `seconds` into it (looped); the others off. */
function pose(v: View, clip: Clip, seconds: number) {
  for (const [name, a] of Object.entries(v.actions) as [Clip, AnimationAction][]) {
    const on = name === clip;
    a.setEffectiveWeight(on ? 1 : 0);
    if (on) {
      const d = a.getClip().duration;
      a.time = ((seconds % d) + d) % d;
    }
  }
  v.mixer.update(0);
}

/** How high the clip has lifted the body this frame, m at size 1. */
const liftOf = (v: View) => (v.bodyBone ? Math.max(0, v.bodyBone.position.z) * MODEL_RAW * MODEL_SCALE : 0);

// ---------------------------------------------------------------------------------------------
// Effects.

type Drop = { alive: boolean; p: Vector3; v: Vector3; r: number; born: number; life: number; landed: boolean };
type Puddle = { mesh: Mesh; mat: MeshStandardMaterial; born: number; size: number };
type Shot = { mesh: Mesh; from: Vector3; to: Vector3; born: number };
type Later = { at: number; run: () => void };

export type SlimeState = {
  kit: Kit;
  group: Group;
  views: Map<number, View>;
  heads: Map<number, Head>;
  drops: Drop[];
  nextDrop: number;
  puddles: Puddle[];
  shots: Shot[];
  later: Later[];
};

const tmp = new Vector3();
const tmpColor = new Color();
const dummy = new Object3D();

function spray(st: SlimeState, at: Vector3, color: number, n: number, size: number, t: number, aim?: Vector3) {
  const count = Math.round(n * (st.kit.quality === "full" ? 1 : 0.55));
  tmpColor.setHex(color);
  for (let i = 0; i < count; i++) {
    const slot = st.nextDrop;
    st.nextDrop = (st.nextDrop + 1) % MAX_DROPS;
    const d = st.drops[slot] ?? (st.drops[slot] = { alive: false, p: new Vector3(), v: new Vector3(), r: 0, born: 0, life: 0, landed: false });
    d.alive = true;
    d.landed = false;
    d.born = t;
    d.life = 0.8 + Math.random() * 0.5;
    d.r = (0.06 + Math.random() * 0.09) * Math.sqrt(size);
    d.p.copy(at).add(tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.4 * size));
    d.v.set(Math.random() * 2 - 1, 0.4 + Math.random(), Math.random() * 2 - 1).multiplyScalar(4.2 * Math.sqrt(size));
    if (aim) d.v.multiplyScalar(0.35).add(tmp.copy(aim).sub(at).normalize().multiplyScalar(3 + Math.random() * 3));
    st.kit.drops.setColorAt(slot, tmpColor);
  }
  if (st.kit.drops.instanceColor) st.kit.drops.instanceColor.needsUpdate = true;
}

function puddle(st: SlimeState, x: number, z: number, color: number, size: number, t: number) {
  while (st.puddles.length >= MAX_PUDDLES) dropPuddle(st, 0);
  const mat = new MeshStandardMaterial({
    color: new Color(color).multiplyScalar(0.92), roughness: 0.25, flatShading: true, transparent: true,
    opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const m = new Mesh(st.kit.geo.puddle, mat);
  m.position.set(x, 0.02 + st.puddles.length * 0.002, z);
  m.rotation.y = Math.random() * Math.PI;
  m.scale.setScalar(0.01);
  m.receiveShadow = st.kit.quality === "full";
  st.group.add(m);
  st.puddles.push({ mesh: m, mat, born: t, size: 0.9 * size });
}

function dropPuddle(st: SlimeState, i: number) {
  const p = st.puddles[i];
  st.group.remove(p.mesh);
  p.mat.dispose();
  st.puddles.splice(i, 1);
}

/** The middle of a slime's body, in world space. */
const centreOf = (v: View, out: Vector3) => out.set(v.root.position.x, v.root.position.y + BODY_Y * v.scale, v.root.position.z);

function shoot(st: SlimeState, from: Vector3, v: View, t: number) {
  const m = new Mesh(st.kit.geo.shot, st.kit.shot);
  m.position.copy(from);
  st.group.add(m);
  st.shots.push({ mesh: m, from: from.clone(), to: centreOf(v, new Vector3()), born: t });
}

function removeView(st: SlimeState, v: View) {
  st.group.remove(v.root);
  v.mixer.stopAllAction();
  v.mixer.uncacheRoot(v.model);
  v.model.traverse((o) => (o as SkinnedMesh).skeleton?.dispose());
  v.skin.dispose();
  st.views.delete(v.id);
}

function burst(st: SlimeState, v: View, t: number) {
  const c = centreOf(v, new Vector3());
  spray(st, c, v.color, v.boss || v.star ? 44 : 18, v.size, t);
  puddle(st, c.x, c.z, v.color, v.boss ? v.size * 1.1 : v.size, t);
  removeView(st, v);
}

function onEvent(st: SlimeState, e: GameEvent, f: SceneFrame) {
  const v = e.id === undefined ? undefined : st.views.get(e.id);
  if (!v) return;
  switch (e.type) {
    case "letter":
      v.jiggle = Math.max(v.jiggle, 0.7);
      return;
    case "word": {
      // A chunk off the boss: a shot, then a splash of its goo.
      shoot(st, f.tip, v, f.t);
      st.later.push({ at: f.t + SHOT_S, run: () => {
        if (!st.views.has(v.id)) return;
        v.jiggle = 1.6;
        spray(st, centreOf(v, new Vector3()).add(tmp.set(0, 0.25 * v.scale, 0)), v.color, 12, 1.4, f.t + SHOT_S);
      } });
      return;
    }
    case "pop":
      shoot(st, f.tip, v, f.t);
      v.slime = null;
      v.poppedAt = f.t;
      return;
    case "stick":
      v.jiggle = 0.6; // a soft landing: the bite itself is slow
      return;
    case "escape":
      // The star got away: a puff of glitter, and it's gone.
      spray(st, centreOf(v, new Vector3()), v.color, 24, 0.8, f.t);
      removeView(st, v);
      return;
    case "explode": {
      // Goo at the screen.
      const at = centreOf(v, new Vector3());
      spray(st, at, v.color, v.boss ? 40 : 26, Math.min(v.size, 1.6), f.t, f.camera.getWorldPosition(new Vector3()));
      puddle(st, at.x, at.z, v.color, v.size * 1.2, f.t);
      removeView(st, v);
      return;
    }
  }
}

/** Places and animates one live slime; returns its label anchor. */
function animate(v: View, s: Slime, f: SceneFrame, locked: boolean): Head {
  const { t, dt, runMs, game } = f;
  const since = Math.max(0, Math.min(TICK_MS * 2, runMs - game.nowMs));
  const stuck = s.stuckLeftMs !== null;
  const speed = speedOf(s);
  const d = stuck ? 0 : Math.max(0, s.distMm - (speed * since) / 1000) / 1000;
  let dist = visualDist(d, v.size, v.boss);
  /** 0..1 through the 3 s stuck. */
  let k = 0;
  if (s.stuckLeftMs !== null) {
    k = clamp01(1 - (s.stuckLeftMs - since) / STICK_MS);
    const near = stickDist(v.size);
    dist = near + (stuckEndDist(v.size) - near) * k;
  }
  const a = s.lane * DEG;
  v.root.position.set(Math.sin(a) * dist, 0, -Math.cos(a) * dist);
  v.root.rotation.y = -a;

  const age = Math.max(0, (runMs - s.spawnedMs) / 1000);
  const swell = 1 + SWELL * k;
  const grow = v.boss ? 1 : easeOutBack(clamp01(age / 0.35));
  v.scale = v.size * swell;
  v.root.scale.setScalar(v.size * swell * Math.max(0.01, grow));

  // The model's own clips: a stuck slime chomps, a slow menacing bite (about 1.1 s) quickening a
  // little (to about 0.75 s) as its 3 s run out; the boss walks; the rest hop, each on its own beat.
  const beat = (t / v.period + v.phase) % 1;
  if (stuck) {
    v.biteS += dt * (0.6 + 0.3 * k);
    v.wobble += dt * (3 + 3 * k);
    v.warnPh += dt * (4 + 6 * k);
    pose(v, "bite", v.biteS);
  } else if (v.boss) {
    pose(v, "walk", beat * v.actions.walk.getClip().duration);
  } else {
    pose(v, "jump", beat * v.actions.jump.getClip().duration);
  }

  let y = 0;
  let sq = 1;
  if (v.boss && age < BOSS_DROP_S) {
    y = (1 - (age / BOSS_DROP_S) ** 2) * 4; // falling in (body units: × 2.6 m)
  } else if (v.boss && age < BOSS_DROP_S + 0.35) {
    sq = 1 - Math.sin(((age - BOSS_DROP_S) / 0.35) * Math.PI) * 0.35; // the landing
  } else if (stuck) {
    sq = 1 + Math.sin(v.wobble) * (0.03 + 0.04 * k);
    y = (0.25 * k) / v.scale;
  }
  v.jiggle *= Math.exp(-dt * 6);
  sq *= 1 + v.jiggle * Math.sin(t * 38) * 0.14;
  if (stuck) sq = Math.max(MIN_SQUASH, sq); // `stuckEndDist` counts on it
  const side = 1 / Math.sqrt(sq);
  v.body.position.y = y;
  v.body.scale.set(side, sq, side);
  v.body.rotation.z = locked && !stuck ? Math.sin(t * 31) * 0.035 : 0; // a biting slime only chomps
  v.shadow.scale.setScalar(Math.max(0.25, 1 - (y + liftOf(v)) * 0.5));

  // A stuck slime pulses warmer and faster as its 3 s run out.
  const warn = stuck ? (0.5 + 0.5 * Math.sin(v.warnPh)) * k : 0;
  v.skin.emissive.setHex(v.color).lerp(tmpColor.setHex(WARN), warn);
  // The star glows, pulsing.
  v.skin.emissiveIntensity = v.star ? 0.16 + 0.1 * Math.sin(t * 9) : 0.08 + warn * 0.55;

  // The label hangs steady above the top of the hop, so the word doesn't bounce.
  const lift = stuck ? 0.25 * k : 0;
  return { x: v.root.position.x, y: (TOP + v.hop) * v.scale + lift + 0.12, z: v.root.position.z, d };
}

export function step(st: SlimeState, f: SceneFrame, events: readonly GameEvent[]) {
  const { t, dt, game } = f;
  // 1. A view for every slime the engine has (before events, so a pop finds its slime).
  const live = new Set<number>();
  for (const s of game.slimes) {
    live.add(s.id);
    let v = st.views.get(s.id);
    if (!v) {
      v = makeView(st.kit, s);
      st.views.set(s.id, v);
      st.group.add(v.root);
    }
    v.slime = s;
  }
  // 2. Effects for what happened since the last frame.
  for (const e of events) onEvent(st, e, f);
  // 3. Animate; a view whose slime went without an event we saw just goes.
  st.heads.clear();
  for (const v of [...st.views.values()]) {
    if (v.poppedAt !== null) {
      const k = (t - v.poppedAt) / SHOT_S;
      if (k >= 1) burst(st, v, t);
      else v.body.scale.set(1 + 0.8 * k, Math.max(0.05, 1 - 0.75 * k), 1 + 0.8 * k);
      continue;
    }
    if (!live.has(v.id) || !v.slime) {
      removeView(st, v);
      continue;
    }
    st.heads.set(v.id, animate(v, v.slime, f, game.lock === v.id));
    if (v.star && t >= v.sparkleAt) {
      spray(st, centreOf(v, new Vector3()).add(tmp.set(0, 0.35 * v.scale, 0)), STAR, 2, 0.35, t);
      v.sparkleAt = t + SPARKLE_S;
    }
  }
  // 4. Delayed effects, shots, droplets, puddles.
  for (let i = st.later.length - 1; i >= 0; i--) {
    if (t >= st.later[i].at) {
      const l = st.later[i];
      st.later.splice(i, 1);
      l.run();
    }
  }
  for (let i = st.shots.length - 1; i >= 0; i--) {
    const s = st.shots[i];
    const k = (t - s.born) / SHOT_S;
    if (k >= 1) {
      st.group.remove(s.mesh);
      st.shots.splice(i, 1);
      continue;
    }
    s.mesh.position.lerpVectors(s.from, s.to, k);
    s.mesh.position.y += Math.sin(k * Math.PI) * 0.12;
  }
  const drops = st.kit.drops;
  let moved = false;
  st.drops.forEach((d, i) => {
    if (!d.alive) return;
    moved = true;
    const age = t - d.born;
    if (age >= d.life) {
      d.alive = false;
      dummy.scale.setScalar(0);
    } else {
      if (!d.landed) {
        d.v.y -= GRAVITY * dt;
        d.p.addScaledVector(d.v, dt);
        if (d.p.y < d.r * 0.5) {
          d.p.y = d.r * 0.5;
          d.landed = true;
        }
      }
      const shrink = 1 - (age / d.life) ** 3;
      dummy.scale.set(d.r * shrink * (d.landed ? 1.5 : 1), d.r * shrink * (d.landed ? 0.45 : 1), d.r * shrink * (d.landed ? 1.5 : 1));
    }
    dummy.position.copy(d.p);
    dummy.updateMatrix();
    drops.setMatrixAt(i, dummy.matrix);
  });
  if (moved) drops.instanceMatrix.needsUpdate = true;
  for (let i = st.puddles.length - 1; i >= 0; i--) {
    const p = st.puddles[i];
    const age = t - p.born;
    const k = age / PUDDLE_S;
    if (k >= 1) {
      dropPuddle(st, i);
      continue;
    }
    const s = Math.min(1, age * 8) * p.size;
    p.mesh.scale.set(s, 1, s * 0.82);
    p.mat.opacity = 0.85 * (1 - clamp01((k - 0.6) / 0.4));
  }
}

/** A fresh set of slimes for one quality, drawn into `group` from the loaded model. */
export function createSlimeState(group: Group, quality: Quality, model: SlimeModel): SlimeState {
  const kit = makeKit(quality, model);
  group.add(kit.drops);
  return { kit, group, views: new Map(), heads: new Map(), drops: [], nextDrop: 0, puddles: [], shots: [], later: [] };
}

/** Takes every slime and effect out of the group and frees the GPU resources. */
export function disposeSlimeState(st: SlimeState) {
  clear(st);
  disposeKit(st.kit);
}

function clear(st: SlimeState) {
  for (const v of [...st.views.values()]) removeView(st, v);
  for (const s of st.shots) st.group.remove(s.mesh);
  while (st.puddles.length) dropPuddle(st, 0);
  st.group.remove(st.kit.drops);
  st.shots = [];
  st.later = [];
  st.drops = [];
  st.heads.clear();
}
