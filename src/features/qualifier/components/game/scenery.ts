// The low-poly pastel world's geometry (D793), apart from React so it can be checked in node.
// Rendering code: trig and floats are fine here (only the engine must be deterministic).
import {
  BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Euler,
  IcosahedronGeometry, Matrix4, PlaneGeometry, Quaternion, Vector3,
} from "three";
import {
  CLOUD, CROWNS, GRASS_TUFT, GROUND, GROUND_LIGHT, MOUNTAINS, PINES, ROCKS, SNOW, TRUNK,
} from "../../game/palette";
import { mulberry32 } from "../../game/rng";
import type { Quality } from "../../game/quality";

const WORLD_SEED = 793;
const DEG = Math.PI / 180;

/** The slimes' clear field: nothing stands at |x| < 7 m closer than 22 m. */
export const FIELD_HALF_X = 7;
export const FIELD_DEPTH = 22;
/** Slimes come from lanes within ±30°, up to 20 m out (the boss). Trees keep out of that cone, plus a margin. */
const CONE_DEG = 30;
const CONE_DIST = 23;

/** Ground height: flat over the play field, gentle low-poly hills beyond it. */
export function groundHeight(x: number, z: number): number {
  const out = Math.hypot(Math.max(0, Math.abs(x) - 11), Math.max(0, -z - 26), Math.max(0, z - 6));
  const rise = Math.min(1, out / 12);
  const wave = (Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17 - 0.4) + 1) / 2;
  return rise * (0.3 + 1.9 * wave);
}

/** Would something of radius `r` at (x, z) stand in the field or in front of a slime? */
export function inTheWay(x: number, z: number, r: number, coneMarginDeg: number): boolean {
  if (Math.abs(x) < FIELD_HALF_X + r && z > -FIELD_DEPTH - r) return true;
  const d = Math.hypot(x, z);
  if (d > CONE_DIST + r) return false;
  const angle = Math.abs(Math.atan2(x, -z)) / DEG;
  return angle < CONE_DEG + coneMarginDeg + Math.atan2(r, Math.max(d, 0.1)) / DEG;
}

const tmpColor = new Color();
const tmpM = new Matrix4();

/** One shape, placed and painted, ready to merge: non-indexed positions plus a flat vertex colour. */
function piece(geo: BufferGeometry, color: number, at: Vector3, rotY = 0, scale: Vector3 | number = 1, tilt = 0): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  geo.dispose();
  const s = typeof scale === "number" ? new Vector3(scale, scale, scale) : scale;
  g.applyMatrix4(tmpM.compose(at, new Quaternion().setFromEuler(new Euler(tilt, rotY, tilt * 0.6)), s));
  const n = g.getAttribute("position").count;
  const colors = new Float32Array(n * 3);
  tmpColor.setHex(color);
  for (let i = 0; i < n; i++) colors.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
  const out = new BufferGeometry();
  out.setAttribute("position", g.getAttribute("position"));
  out.setAttribute("color", new BufferAttribute(colors, 3));
  return out;
}

/** Concatenates pieces into one geometry with flat normals. */
function merge(pieces: BufferGeometry[]): BufferGeometry {
  const total = pieces.reduce((n, p) => n + p.getAttribute("position").count, 0);
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let at = 0;
  for (const p of pieces) {
    pos.set(p.getAttribute("position").array as Float32Array, at * 3);
    col.set(p.getAttribute("color").array as Float32Array, at * 3);
    at += p.getAttribute("position").count;
    p.dispose();
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("color", new BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Faceted grass: a jittered grid on `groundHeight`, each triangle a slightly different green. */
function groundGeometry(rand: () => number, lite: boolean): BufferGeometry {
  const size = 300;
  const seg = lite ? 50 : 75;
  const g = new PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute("position");
  const step = size / seg;
  for (let i = 0; i < p.count; i++) {
    const edge = Math.abs(Math.abs(p.getX(i)) - size / 2) < 0.01 || Math.abs(Math.abs(p.getZ(i)) - size / 2) < 0.01;
    const x = p.getX(i) + (edge ? 0 : (rand() - 0.5) * step * 0.6);
    const z = p.getZ(i) + (edge ? 0 : (rand() - 0.5) * step * 0.6);
    p.setXYZ(i, x, groundHeight(x, z), z);
  }
  const flat = g.toNonIndexed();
  g.dispose();
  const n = flat.getAttribute("position").count;
  const colors = new Float32Array(n * 3);
  const a = new Color(GROUND);
  const b = new Color(GROUND_LIGHT);
  for (let tri = 0; tri < n / 3; tri++) {
    tmpColor.copy(a).lerp(b, rand() * 0.85).multiplyScalar(0.97 + rand() * 0.05);
    for (let v = 0; v < 3; v++) colors.set([tmpColor.r, tmpColor.g, tmpColor.b], (tri * 3 + v) * 3);
  }
  flat.setAttribute("color", new BufferAttribute(colors, 3));
  flat.deleteAttribute("uv");
  flat.computeVertexNormals();
  return flat;
}

export type Cloud = { geometry: BufferGeometry; x: number; y: number; z: number; speed: number };

export type BuiltWorld = { ground: BufferGeometry; props: BufferGeometry; mountains: BufferGeometry; clouds: Cloud[] };

export function buildWorld(quality: Quality): BuiltWorld {
  const lite = quality === "lite";
  const rand = mulberry32(WORLD_SEED);
  const rnd = (a: number, b: number) => a + rand() * (b - a);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const keep = (i: number) => !lite || i % 2 === 0; // lite: every other object

  const ground = groundGeometry(rand, lite);
  const props: BufferGeometry[] = [];

  /** A spot clear of the field and the slimes' cone, tried a few times. */
  const spot = (gen: () => [number, number], r: number, margin: number): [number, number] | null => {
    for (let k = 0; k < 24; k++) {
      const [x, z] = gen();
      if (!inTheWay(x, z, r, margin)) return [x, z];
    }
    return null;
  };

  const tree = (x: number, z: number, s: number) => {
    const y = groundHeight(x, z) - 0.1;
    props.push(piece(new CylinderGeometry(0.18, 0.26, 1.4, 5), TRUNK, new Vector3(x, y + 0.7 * s, z), rnd(0, 3), s));
    const kind = rand();
    if (kind < 0.5) {
      // A gem-cut crown.
      props.push(piece(new IcosahedronGeometry(1.3, 0), pick(CROWNS), new Vector3(x, y + 2.3 * s, z), rnd(0, 3),
        new Vector3(s, s * rnd(1, 1.2), s), rnd(-0.15, 0.15)));
    } else if (kind < 0.82) {
      props.push(piece(new ConeGeometry(1.1, 2.6, 6), pick(PINES), new Vector3(x, y + 2.4 * s, z), rnd(0, 3), s));
    } else {
      // A two-tier pine.
      const c = pick(PINES);
      props.push(piece(new ConeGeometry(1.25, 1.9, 6), c, new Vector3(x, y + 1.9 * s, z), rnd(0, 3), s));
      props.push(piece(new ConeGeometry(0.9, 1.6, 6), c, new Vector3(x, y + 2.9 * s, z), rnd(0, 3), s));
    }
  };

  // Trees down both sides of the field ...
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? 1 : -1;
    const s = rnd(0.8, 1.4);
    const at = spot(() => [side * rnd(8, 21), -rnd(-3, 40)], 1.6 * s, 10);
    if (at && keep(i)) tree(at[0], at[1], s);
  }
  // ... and a tree line behind it, past where any slime starts.
  for (let i = 0; i < 12; i++) {
    const s = rnd(1, 1.5);
    const at = spot(() => [rnd(-22, 22), -rnd(26, 44)], 1.6 * s, 10);
    if (at && keep(i)) tree(at[0], at[1], s);
  }

  // Rocks, some in pairs.
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1;
    const r = rnd(0.3, 0.9);
    const at = spot(() => [side * rnd(7.5, 15), -rnd(1, 34)], r, 4);
    if (!at || !keep(i)) continue;
    const [x, z] = at;
    const y = groundHeight(x, z);
    props.push(piece(new DodecahedronGeometry(r, 0), pick(ROCKS), new Vector3(x, y + r * 0.35, z), rnd(0, 3), 1, rnd(0, 1)));
    if (i % 3 === 0) {
      const r2 = r * rnd(0.35, 0.55);
      props.push(piece(new DodecahedronGeometry(r2, 0), pick(ROCKS), new Vector3(x + side * (r + r2) * 0.9, y + r2 * 0.3, z + rnd(-0.3, 0.3)), rnd(0, 3), 1, rnd(0, 1)));
    }
  }

  // A few low grass tufts, so the open grass reads as ground at a distance (full only).
  if (!lite) {
    for (let i = 0; i < 36; i++) {
      const at = spot(() => [rnd(-16, 16), -rnd(2, 30)], 0.3, -8);
      if (!at) continue;
      const [x, z] = at;
      const y = groundHeight(x, z);
      for (let k = 0; k < 3; k++) {
        props.push(piece(new ConeGeometry(0.06, rnd(0.22, 0.36), 3), GRASS_TUFT, new Vector3(x + (k - 1) * 0.07, y + 0.12, z),
          rnd(0, 3), 1, (k - 1) * 0.3));
      }
    }
  }

  // Five-sided mountains on the horizon, each with a snow cap a touch wider than its peak.
  const mountains: BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const h = rnd(12, 20);
    const r = rnd(9, 13);
    const x = -42 + i * 14 + rnd(-3, 3);
    const z = -rnd(56, 68);
    const rot = rnd(0, 3);
    const c = pick(MOUNTAINS);
    if (lite && i % 3 === 1) continue;
    mountains.push(piece(new ConeGeometry(r, h, 5), c, new Vector3(x, h / 2 - 1, z), rot));
    const ch = h * 0.32;
    mountains.push(piece(new ConeGeometry(r * 0.345, ch, 5), SNOW, new Vector3(x, h - 1 - ch / 2 + 0.08, z), rot));
  }

  // Faceted clouds drifting slowly across the sky.
  const clouds: Cloud[] = [];
  for (let i = 0; i < 8; i++) {
    const parts: BufferGeometry[] = [];
    const n = 3 + (i % 2);
    for (let k = 0; k < n; k++) {
      const r = rnd(1, 1.7);
      parts.push(piece(new IcosahedronGeometry(r, 0), CLOUD, new Vector3(k * 1.5 - (n - 1) * 0.75, rnd(-0.3, 0.3), rnd(-0.4, 0.4)),
        rnd(0, 3), new Vector3(1, 0.72, 1)));
    }
    const cloud = { geometry: merge(parts), x: rnd(-34, 34), y: rnd(10, 15), z: -rnd(26, 52), speed: rnd(0.15, 0.4) };
    if (keep(i)) clouds.push(cloud);
    else cloud.geometry.dispose();
  }

  return { ground, props: merge(props), mountains: merge(mountains), clouds };
}

export function disposeWorld(w: BuiltWorld) {
  w.ground.dispose();
  w.props.dispose();
  w.mountains.dispose();
  w.clouds.forEach((c) => c.geometry.dispose());
}
