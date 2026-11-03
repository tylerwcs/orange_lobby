import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { Group, Matrix4, PerspectiveCamera, Vector3, type Mesh, type SkinnedMesh } from "three";
import { advance, currentWord, newGame, press, type GameEvent } from "@/features/qualifier/game/engine";
import { BOSS_AT_MS } from "@/features/qualifier/game/rules";
import { FIELD_DEPTH, FIELD_HALF_X, buildWorld, disposeWorld } from "@/features/qualifier/components/game/scenery";
import { BODY_R, BODY_SY, BODY_Y, createSlimeState, disposeSlimeState, step } from "@/features/qualifier/components/game/slimeFx";
import { parseSlimeModel, type SlimeModel } from "@/features/qualifier/components/game/slimeModel";
import { SLIMES, slimeColour } from "@/features/qualifier/game/palette";

// The scene can't be drawn in node, but its geometry and its per-frame logic can be run.

describe("the world (D793)", () => {
  it("keeps every tree, rock and tuft out of the clear field (|x| < 7 m closer than 22 m)", () => {
    for (const q of ["full", "lite"] as const) {
      const w = buildWorld(q);
      const p = w.props.getAttribute("position");
      const offenders: string[] = [];
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(p.getX(i)) < FIELD_HALF_X && p.getZ(i) > -FIELD_DEPTH) offenders.push(`${p.getX(i).toFixed(2)},${p.getZ(i).toFixed(2)}`);
      }
      expect(offenders).toEqual([]);
      disposeWorld(w);
    }
  });

  it("draws about half the objects in lite, and the same world every time", () => {
    const full = buildWorld("full");
    const lite = buildWorld("lite");
    const again = buildWorld("full");
    const n = (w: ReturnType<typeof buildWorld>) => w.props.getAttribute("position").count;
    expect(n(lite)).toBeLessThan(n(full) * 0.6);
    expect(lite.clouds.length).toBeLessThan(full.clouds.length);
    expect(Array.from(again.props.getAttribute("position").array)).toEqual(Array.from(full.props.getAttribute("position").array));
    [full, lite, again].forEach(disposeWorld);
  });
});

// Each test plays a minute or more of frames through skinned models: slow when every file runs at once.
describe("the slimes' frame logic (D793)", { timeout: 30_000 }, () => {
  let model: SlimeModel;
  beforeAll(async () => {
    const file = readFileSync("public/models/slime.glb");
    model = await parseSlimeModel(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  });

  it("follows a real run: a view per slime, finite places, pops leave puddles, the boss arrives", () => {
    for (const quality of ["full", "lite"] as const) {
      const game = newGame(42);
      const group = new Group();
      const st = createSlimeState(group, quality, model);
      const camera = new PerspectiveCamera(68, 16 / 9, 0.05, 220);
      camera.position.set(0, 1.6, 0);
      camera.updateMatrixWorld();
      const tip = new Vector3(0.2, 1.4, -0.5);
      const seen = new Set<GameEvent["type"]>();
      let puddles = 0;
      let bossSeen = false;
      for (let ms = 0; ms < BOSS_AT_MS[0] + 5000 && !game.ended; ms += 1000 / 60) {
        const t = Math.round(ms);
        advance(game, t);
        // Pop each small slime once it's within 7 m, word by word; type the boss's first word.
        for (const s of [...game.slimes]) {
          if (game.ended) break;
          if (s.kind === "small" && s.distMm <= 7000) for (const c of currentWord(s).slice(s.typed)) press(game, c, t);
          if (s.kind === "boss" && s.wordIndex === 0 && ms > BOSS_AT_MS[0] + 2000) for (const c of currentWord(s).slice(s.typed)) press(game, c, t);
        }
        const events = game.events.splice(0);
        events.forEach((e) => seen.add(e.type));
        step(st, { t: ms / 1000, dt: 1 / 60, runMs: ms, game, quality, camera, tip }, events);

        for (const s of game.slimes) {
          const head = st.heads.get(s.id);
          expect(head, `head of ${s.id}`).toBeDefined();
          expect([head!.x, head!.y, head!.z].every(Number.isFinite)).toBe(true);
          expect(head!.y).toBeGreaterThan(0.5);
          if (s.kind === "boss") bossSeen = true;
        }
        for (const id of st.views.keys()) expect(game.slimes.some((s) => s.id === id) || st.views.get(id)!.poppedAt !== null).toBe(true);
        puddles = Math.max(puddles, st.puddles.length);
        group.traverse((o) => {
          expect(Number.isFinite(o.position.x) && Number.isFinite(o.position.y) && Number.isFinite(o.position.z)).toBe(true);
        });
      }
      expect(seen.has("pop")).toBe(true);
      expect(seen.has("word")).toBe(true);
      expect(bossSeen).toBe(true);
      expect(puddles).toBeGreaterThan(0);
      expect(st.drops.some((d) => d.born > 0)).toBe(true);
      disposeSlimeState(st);
      expect(group.children.length).toBe(0);
    }
  });

  /** Is the camera outside every slime's hull (its true, squashed, swelled, tilted ellipsoid), with a margin? */
  function cameraClear(st: ReturnType<typeof createSlimeState>, group: Group, camera: PerspectiveCamera, margin: number): string[] {
    group.updateMatrixWorld(true);
    const bad: string[] = [];
    const inv = new Matrix4();
    const eye = camera.getWorldPosition(new Vector3());
    for (const v of st.views.values()) {
      // In the body's own space the hull is an ellipsoid round (0, BODY_Y, 0): BODY_R across and deep, BODY_R × BODY_SY high.
      const local = eye.clone().applyMatrix4(inv.copy(v.body.matrixWorld).invert());
      const e = Math.hypot(local.x / BODY_R, (local.y - BODY_Y) / (BODY_R * BODY_SY), local.z / BODY_R);
      if (e < margin) bad.push(`${v.boss ? "boss" : "small"} ${v.id} size ${v.size.toFixed(2)}: ${e.toFixed(3)}`);
    }
    return bad;
  }

  /** Every 3rd vertex of every slime's skinned model as drawn this frame, in world space. */
  function skinPoints(st: ReturnType<typeof createSlimeState>, group: Group, only?: (v: { boss: boolean; slime: { stuckLeftMs: number | null } | null }) => boolean): Vector3[] {
    group.updateMatrixWorld(true);
    const out: Vector3[] = [];
    for (const v of st.views.values()) {
      if (only && !only(v)) continue;
      v.model.traverse((o) => {
        const m = o as SkinnedMesh;
        if (!m.isSkinnedMesh) return;
        for (let i = 0; i < m.geometry.attributes.position.count; i += 3) out.push(m.getVertexPosition(i, new Vector3()).applyMatrix4(m.matrixWorld));
      });
    }
    return out;
  }

  it("colours slimes eight ways: the engine's look picks a pair, the id one of it", () => {
    const all = [0, 1, 2, 3].flatMap((look) => [0, 1].map((id) => slimeColour(look, id)));
    expect(new Set(all)).toEqual(new Set(SLIMES));
    expect(slimeColour(6, 3)).toBe(slimeColour(2, 1)); // any integer
    expect(slimeColour(-1, -2)).toBe(slimeColour(1, 0));
  });

  it("hangs each label above its slime's real top, crowns the boss on its head, and mixes the colours", () => {
    const game = newGame(42);
    const group = new Group();
    const st = createSlimeState(group, "full", model);
    const camera = new PerspectiveCamera(68, 16 / 9, 0.05, 220);
    camera.position.set(0, 1.6, 0);
    const colours = new Set<number>();
    const low: string[] = [];
    let crowned = 0;
    let frame = 0;
    for (let ms = 0; ms < BOSS_AT_MS[0] + 8000 && !game.ended; ms += 1000 / 60) {
      const t = Math.round(ms);
      advance(game, t);
      for (const s of [...game.slimes]) {
        if (!game.ended && s.kind === "small" && s.distMm <= 9000) for (const c of currentWord(s).slice(s.typed)) press(game, c, t);
      }
      step(st, { t: ms / 1000, dt: 1 / 60, runMs: ms, game, quality: "full", camera, tip: new Vector3() }, game.events.splice(0));
      if (frame++ % 10 !== 0) continue;
      for (const v of st.views.values()) {
        colours.add(v.color);
        const head = st.heads.get(v.id);
        // The boss's label waits where it will land while it drops in from the sky.
        if (!head || (v.boss && v.body.position.y > 0.01)) continue;
        const top = Math.max(...skinPoints(st, group, (w) => w === v).map((p) => p.y));
        if (top >= head.y) low.push(`${v.boss ? "boss" : "small"} ${v.id}: top ${top.toFixed(2)} label ${head.y.toFixed(2)}`);
        if (v.boss) {
          const gold: Vector3[] = [];
          v.model.traverse((o) => {
            if ((o as Mesh).isMesh && (o as Mesh).material === st.kit.gold) gold.push(o.getWorldPosition(new Vector3()));
          });
          const crownY = Math.max(...gold.map((p) => p.y));
          // On the head: between the slime's middle and a crown's height above its top, over its middle.
          expect(crownY).toBeGreaterThan(top * 0.6);
          expect(crownY).toBeLessThan(top + 0.6);
          expect(Math.hypot(gold[0].x - v.root.position.x, gold[0].z - v.root.position.z)).toBeLessThan(1.2);
          crowned++;
        }
      }
    }
    disposeSlimeState(st);
    expect(low.slice(0, 5)).toEqual([]);
    expect(crowned).toBeGreaterThan(0);
    expect(colours.size).toBeGreaterThanOrEqual(6);
  });

  it("brings unanswered slimes up close, never into the player's face, and lets them explode", () => {
    let exploded = 0;
    let nearest = Infinity;
    let biggest = 0;
    const bad: string[] = [];
    // Slimes under size 1.1 are popped at 7 m, so the stuck ones include the largest (up to 1.15).
    const game = newGame(7);
    const group = new Group();
    const st = createSlimeState(group, "full", model);
    const camera = new PerspectiveCamera(68, 16 / 9, 0.05, 220);
    camera.position.set(0, 1.6, 0);
    let skinNearest = Infinity;
    let frame = 0;
    /** The bite clip's time last frame, per stuck slime, and its biggest step in one frame. */
    const biteAt = new Map<number, number>();
    let biteStep = 0;
    let biteFrames = 0;
    for (let ms = 0; ms < BOSS_AT_MS[0] && !game.ended; ms += 1000 / 60) {
      const t = Math.round(ms);
      advance(game, t);
      for (const s of [...game.slimes]) {
        const size = st.views.get(s.id)?.size ?? 0;
        if (!game.ended && s.stuckLeftMs === null && s.distMm <= 7000 && size < 1.1) for (const c of currentWord(s).slice(s.typed)) press(game, c, t);
      }
      const events = game.events.splice(0);
      exploded += events.filter((e) => e.type === "explode").length;
      step(st, { t: ms / 1000, dt: 1 / 60, runMs: ms, game, quality: "full", camera, tip: new Vector3() }, events);
      for (const h of st.heads.values()) nearest = Math.min(nearest, Math.hypot(h.x, h.z));
      for (const v of st.views.values()) if (v.slime?.stuckLeftMs != null) biggest = Math.max(biggest, v.size);
      bad.push(...cameraClear(st, group, camera, 1.1));
      // The model's real skin, chomping, every 4th frame.
      if (frame++ % 4 === 0) for (const p of skinPoints(st, group, (v) => v.slime?.stuckLeftMs != null)) skinNearest = Math.min(skinNearest, p.distanceTo(camera.position));
      for (const v of st.views.values()) {
        if (v.slime?.stuckLeftMs == null) continue;
        const now = v.actions.bite.time;
        const was = biteAt.get(v.id);
        if (was !== undefined) {
          const d = v.actions.bite.getClip().duration;
          biteStep = Math.max(biteStep, (now - was + d) % d);
          biteFrames++;
        }
        biteAt.set(v.id, now);
      }
    }
    disposeSlimeState(st);
    // The chomp plays at 0.6-0.9 × its clip's speed however late in the run (never t × a rising rate, which glitched).
    expect(biteFrames).toBeGreaterThan(100);
    expect(biteStep).toBeLessThanOrEqual((0.9 / 60) * 1.001);
    expect(skinNearest).toBeGreaterThan(2.6); // never in the player's face: the field stays in view
    expect(skinNearest).toBeLessThan(4); // but close
    expect(exploded).toBeGreaterThanOrEqual(2);
    expect(biggest).toBeGreaterThan(1.1);
    expect(bad.slice(0, 5)).toEqual([]);
    expect(nearest).toBeLessThan(4.6); // still close
  });

  it("keeps the camera outside the boss through the whole 3 s stick, letters landing on it included", () => {
    const game = newGame(42);
    const group = new Group();
    const st = createSlimeState(group, "full", model);
    const camera = new PerspectiveCamera(68, 16 / 9, 0.05, 220);
    camera.position.set(0, 1.6, 0);
    let bossSkinNearest = Infinity;
    let frame = 0;
    let bossStuckFrames = 0;
    let bossExploded = false;
    const bad: string[] = [];
    for (let ms = 0; ms < BOSS_AT_MS[0] + 60000 && !game.ended && !bossExploded; ms += 1000 / 60) {
      const t = Math.round(ms);
      advance(game, t);
      for (const s of [...game.slimes]) {
        if (game.ended) break;
        if (s.kind === "small" && s.distMm <= 7000) for (const c of currentWord(s).slice(s.typed)) press(game, c, t);
        // Once stuck, type the boss's first word now and then (word jiggles), never the whole sentence.
        if (s.kind === "boss" && s.stuckLeftMs !== null && s.wordIndex === 0 && s.stuckLeftMs < 1500) {
          for (const c of currentWord(s).slice(s.typed)) press(game, c, t);
        }
      }
      const events = game.events.splice(0);
      if (events.some((e) => e.type === "explode" && game.slimes.every((s) => s.kind !== "boss"))) bossExploded = true;
      step(st, { t: ms / 1000, dt: 1 / 60, runMs: ms, game, quality: "full", camera, tip: new Vector3() }, events);
      if (game.slimes.some((s) => s.kind === "boss" && s.stuckLeftMs !== null)) bossStuckFrames++;
      bad.push(...cameraClear(st, group, camera, 1.1));
      if (frame++ % 4 === 0) for (const p of skinPoints(st, group, (v) => v.boss && v.slime?.stuckLeftMs != null)) bossSkinNearest = Math.min(bossSkinNearest, p.distanceTo(camera.position));
    }
    expect(bossSkinNearest).toBeGreaterThan(2.6);
    expect(bossStuckFrames).toBeGreaterThan(150); // most of the 3 s, watched frame by frame
    expect(bossExploded).toBe(true);
    expect(bad.slice(0, 5)).toEqual([]);
    disposeSlimeState(st);
  });
});
