// The slimes' views and effects (D793), apart from React so a run can be checked in node.
// Imperative three.js, driven once a frame by the scene; the Game is only read. Rendering code:
// trig, floats and Math.random are fine here (only the engine must be deterministic).
import {
  CircleGeometry, Color, CylinderGeometry, Group, IcosahedronGeometry, InstancedMesh, Mesh, MeshBasicMaterial,
  MeshPhysicalMaterial, MeshStandardMaterial, Object3D, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry,
  type Camera, type Material,
} from "three";
import type { Game, GameEvent, Slime } from "../../game/engine";
import { BLASTER_TRIM, BLUSH, CROWN_GOLD, EYE, PUPIL, SHADOW, SLIMES, WARN } from "../../game/palette";
import type { Quality } from "../../game/quality";
import { BOSS_SPEED_MM_S, STICK_MS, TICK_MS, speedAt } from "../../game/rules";

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
/** Body proportions at size 1: a jelly sphere squashed a little, sitting on the ground. */
const BODY_Y = 0.57;
const BODY_R = 0.7;
const BODY_SY = 0.82;
const TOP = BODY_Y + BODY_R * BODY_SY;
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

const sizeOf = (s: Slime) => (s.kind === "boss" ? BOSS_SIZE : 0.85 + hash01(s.id, 1) * 0.3);
/** How much a stuck slime has swelled when its 3 s run out. */
const SWELL = 0.45;
/** A stuck slime's squash never goes below this, so its body is never wider than 1/√0.76 ≈ 1.15 × its radius. */
const MIN_SQUASH = 0.76;
const WIDEST = 1 / Math.sqrt(MIN_SQUASH);
/** Space kept between the camera and the nearest a slime's skin can come, m. */
const CLEARANCE = 0.3;
/**
 * Where a stuck slime ends up: its body fully swelled and at its widest wobble still `CLEARANCE`
 * clear of the camera (the camera is then outside it whatever its height, boss included).
 */
const stuckEndDist = (size: number) => BODY_R * size * (1 + SWELL) * WIDEST + CLEARANCE;
/** Where a slime stops as its 3 s start: a little farther out, so it can creep in while it swells. */
const stickDist = (size: number) => stuckEndDist(size) * 1.18;
/**
 * World distance for a real distance `d` (m). Exactly `d` until the last few metres, which are
 * eased onto `stickDist` so a slime arrives as its 3 s start, instead of passing the camera.
 */
function visualDist(d: number, size: number, boss: boolean): number {
  const ramp = boss ? 6 : 4;
  const near = stickDist(size);
  return d >= ramp ? d : near + (d * (ramp - near)) / ramp;
}

// ---------------------------------------------------------------------------------------------
// Shared geometry and materials, made once per quality.

type Kit = {
  quality: Quality;
  geo: Record<"jelly" | "core" | "shine" | "dot" | "eye" | "pupil" | "glint" | "smile" | "worried" | "blush" | "shadow" | "band" | "spike" | "drop" | "puddle" | "shot", BufferGeometry>;
  core: MeshStandardMaterial[];
  blush: MeshBasicMaterial[];
  shine: MeshBasicMaterial;
  eye: MeshBasicMaterial;
  pupil: MeshBasicMaterial;
  shadow: MeshBasicMaterial;
  gold: MeshStandardMaterial;
  drop: MeshStandardMaterial;
  shot: MeshStandardMaterial;
  /** Droplets in flight, for every slime at once: one draw call. */
  drops: InstancedMesh;
};

function makeKit(quality: Quality): Kit {
  const full = quality === "full";
  const puddle = new CircleGeometry(1, 12);
  puddle.rotateX(-Math.PI / 2);
  const shadow = new CircleGeometry(0.65, 20);
  shadow.rotateX(-Math.PI / 2);
  const geo: Kit["geo"] = {
    jelly: new SphereGeometry(BODY_R, full ? 32 : 20, full ? 24 : 14),
    core: new SphereGeometry(0.42, 16, 12),
    shine: new SphereGeometry(0.13, 12, 8),
    dot: new SphereGeometry(0.05, 8, 6),
    eye: new SphereGeometry(0.15, 16, 12),
    pupil: new SphereGeometry(0.085, 12, 10),
    glint: new SphereGeometry(0.03, 6, 4),
    smile: new TorusGeometry(0.09, 0.025, 6, 14, Math.PI),
    worried: new TorusGeometry(0.055, 0.022, 6, 14),
    blush: new CircleGeometry(0.075, 12),
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
  return {
    quality,
    geo,
    core: SLIMES.map((c) => new MeshStandardMaterial({ color: new Color(c).multiplyScalar(0.72), roughness: 0.5 })),
    blush: SLIMES.map((c) => new MeshBasicMaterial({ color: new Color(c).lerp(new Color(BLUSH), 0.65) })),
    shine: new MeshBasicMaterial({ color: EYE, transparent: true, opacity: 0.85 }),
    eye: new MeshBasicMaterial({ color: EYE }),
    pupil: new MeshBasicMaterial({ color: PUPIL }),
    shadow: new MeshBasicMaterial({ color: SHADOW, transparent: true, opacity: full ? 0.12 : 0.2, depthWrite: false }),
    gold: new MeshStandardMaterial({ color: CROWN_GOLD, flatShading: true, roughness: 0.35, metalness: 0.3 }),
    drop,
    shot: new MeshStandardMaterial({ color: BLASTER_TRIM, roughness: 0.25, emissive: BLASTER_TRIM, emissiveIntensity: 0.35 }),
    drops,
  };
}

function disposeKit(k: Kit) {
  Object.values(k.geo).forEach((g) => g.dispose());
  [...k.core, ...k.blush, k.shine, k.eye, k.pupil, k.shadow, k.gold, k.drop, k.shot].forEach((m) => m.dispose());
  k.drops.dispose();
}

/** A glossy jelly skin, one per slime (its warning pulse is its own). */
function jellyMaterial(k: Kit, look: number): MeshStandardMaterial {
  const color = SLIMES[look] ?? SLIMES[0];
  const base = { color, transparent: true, opacity: 0.9, emissive: color, emissiveIntensity: 0.12 };
  return k.quality === "full"
    ? new MeshPhysicalMaterial({ ...base, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.18 })
    : new MeshStandardMaterial({ ...base, roughness: 0.35 });
}

// ---------------------------------------------------------------------------------------------
// One slime on screen.

type View = {
  id: number;
  boss: boolean;
  look: number;
  size: number;
  root: Group;
  body: Group;
  shadow: Mesh;
  jelly: MeshStandardMaterial;
  smile: Mesh;
  worried: Mesh;
  /** Hop period (s), phase (0..1) and height (body units). */
  period: number;
  phase: number;
  hop: number;
  /** A letter or word landing: 1, then dying away. */
  jiggle: number;
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
  const look = Math.abs(s.look) % SLIMES.length;
  const boss = s.kind === "boss";
  const jelly = jellyMaterial(k, look);
  const body = new Group();
  const skin = mesh(k.geo.jelly, jelly, 0, BODY_Y, 0, 1, BODY_SY, 1);
  skin.castShadow = k.quality === "full";
  const smile = mesh(k.geo.smile, k.pupil, 0, 0.5, 0.685);
  smile.rotation.z = Math.PI;
  const worried = mesh(k.geo.worried, k.pupil, 0, 0.49, 0.685);
  worried.visible = false;
  const blushL = mesh(k.geo.blush, k.blush[look], -0.36, 0.55, 0.61);
  blushL.rotation.y = -0.55;
  const blushR = mesh(k.geo.blush, k.blush[look], 0.36, 0.55, 0.61);
  blushR.rotation.y = 0.55;
  body.add(
    skin,
    mesh(k.geo.core, k.core[look], 0, 0.5, 0, 1, 0.8, 1),
    mesh(k.geo.shine, k.shine, -0.3, 0.955, 0.42, 1, 0.6, 0.5),
    mesh(k.geo.dot, k.shine, -0.12, 1.0, 0.45),
    mesh(k.geo.eye, k.eye, -0.2, 0.7, 0.6, 1, 1.1, 0.55),
    mesh(k.geo.eye, k.eye, 0.2, 0.7, 0.6, 1, 1.1, 0.55),
    mesh(k.geo.pupil, k.pupil, -0.19, 0.69, 0.665, 1, 1.1, 0.5),
    mesh(k.geo.pupil, k.pupil, 0.21, 0.69, 0.665, 1, 1.1, 0.5),
    mesh(k.geo.glint, k.eye, -0.16, 0.73, 0.7),
    mesh(k.geo.glint, k.eye, 0.24, 0.73, 0.7),
    smile, worried, blushL, blushR,
  );
  if (boss) {
    // A little gold crown, tipped to one side.
    const crown = new Group();
    crown.add(mesh(k.geo.band, k.gold, 0, 0, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      crown.add(mesh(k.geo.spike, k.gold, Math.sin(a) * 0.28, 0.12, Math.cos(a) * 0.28, 1, 1.6, 1));
    }
    crown.position.set(0.05, TOP - 0.04, 0);
    crown.rotation.z = -0.18;
    body.add(crown);
  }
  const shadow = mesh(k.geo.shadow, k.shadow, 0, 0.02, 0);
  const root = new Group();
  root.add(body, shadow);
  return {
    id: s.id, boss, look, size: sizeOf(s), root, body, shadow, jelly, smile, worried,
    period: boss ? 1.5 : 0.62 + hash01(s.id, 2) * 0.22,
    phase: hash01(s.id, 3),
    hop: boss ? 0.18 : 0.5 + hash01(s.id, 4) * 0.15,
    jiggle: 0, slime: s, poppedAt: null, scale: 1,
  };
}

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

function spray(st: SlimeState, at: Vector3, look: number, n: number, size: number, t: number, aim?: Vector3) {
  const count = Math.round(n * (st.kit.quality === "full" ? 1 : 0.55));
  tmpColor.setHex(SLIMES[look] ?? SLIMES[0]);
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

function puddle(st: SlimeState, x: number, z: number, look: number, size: number, t: number) {
  while (st.puddles.length >= MAX_PUDDLES) dropPuddle(st, 0);
  const mat = new MeshStandardMaterial({
    color: new Color(SLIMES[look] ?? SLIMES[0]).multiplyScalar(0.92), roughness: 0.25, flatShading: true, transparent: true,
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
  v.jelly.dispose();
  st.views.delete(v.id);
}

function burst(st: SlimeState, v: View, t: number) {
  const c = centreOf(v, new Vector3());
  spray(st, c, v.look, v.boss ? 44 : 18, v.size, t);
  puddle(st, c.x, c.z, v.look, v.boss ? v.size * 1.1 : v.size, t);
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
        spray(st, centreOf(v, new Vector3()).add(tmp.set(0, 0.25 * v.scale, 0)), v.look, 12, 1.4, f.t + SHOT_S);
      } });
      return;
    }
    case "pop":
      shoot(st, f.tip, v, f.t);
      v.slime = null;
      v.poppedAt = f.t;
      return;
    case "stick":
      v.jiggle = 1.5;
      return;
    case "explode": {
      // Goo at the screen.
      const at = centreOf(v, new Vector3());
      spray(st, at, v.look, v.boss ? 40 : 26, Math.min(v.size, 1.6), f.t, f.camera.getWorldPosition(new Vector3()));
      puddle(st, at.x, at.z, v.look, v.size * 1.2, f.t);
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
  const speed = s.kind === "boss" ? BOSS_SPEED_MM_S : speedAt(s.spawnedMs);
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

  let y = 0;
  let sq = 1;
  if (v.boss && age < BOSS_DROP_S) {
    y = (1 - (age / BOSS_DROP_S) ** 2) * 4; // falling in (body units: × 2.6 m)
  } else if (v.boss && age < BOSS_DROP_S + 0.35) {
    sq = 1 - Math.sin(((age - BOSS_DROP_S) / 0.35) * Math.PI) * 0.35; // the landing
  } else if (stuck) {
    sq = 1 + Math.sin(t * (5 + 12 * k)) * (0.05 + 0.08 * k);
    y = (0.25 * k) / v.scale;
  } else {
    const ph = (t / v.period + v.phase) % 1;
    if (ph < 0.7) {
      const arc = Math.sin((ph / 0.7) * Math.PI);
      y = arc * v.hop;
      sq = 1 + arc * 0.14;
    } else {
      sq = 1 - Math.sin(((ph - 0.7) / 0.3) * Math.PI) * 0.28;
    }
  }
  v.jiggle *= Math.exp(-dt * 6);
  sq *= 1 + v.jiggle * Math.sin(t * 38) * 0.14;
  if (stuck) sq = Math.max(MIN_SQUASH, sq); // `stuckEndDist` counts on it
  const side = 1 / Math.sqrt(sq);
  v.body.position.y = y;
  v.body.scale.set(side, sq, side);
  v.body.rotation.z = locked ? Math.sin(t * 31) * 0.035 : 0;
  v.shadow.scale.setScalar(Math.max(0.25, 1 - y * 0.5));
  v.smile.visible = !locked;
  v.worried.visible = locked;

  // A stuck slime pulses warmer and faster as its 3 s run out.
  const warn = stuck ? (0.5 + 0.5 * Math.sin(t * (6 + 16 * k))) * k : 0;
  v.jelly.emissive.setHex(SLIMES[v.look] ?? SLIMES[0]).lerp(tmpColor.setHex(WARN), warn);
  v.jelly.emissiveIntensity = 0.12 + warn * 0.55;

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

/** A fresh set of slimes for one quality, drawn into `group`. */
export function createSlimeState(group: Group, quality: Quality): SlimeState {
  const kit = makeKit(quality);
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

