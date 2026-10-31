import { describe, expect, it } from "vitest";
import { Group, Matrix4, PerspectiveCamera, Vector3 } from "three";
import { advance, currentWord, newGame, press, type GameEvent } from "@/features/qualifier/game/engine";
import { BOSS_FIRST_MS } from "@/features/qualifier/game/rules";
import { FIELD_DEPTH, FIELD_HALF_X, buildWorld, disposeWorld } from "@/features/qualifier/components/game/scenery";
import { createSlimeState, disposeSlimeState, step } from "@/features/qualifier/components/game/slimeFx";

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

describe("the slimes' frame logic (D793)", () => {
  it("follows a real run: a view per slime, finite places, pops leave puddles, the boss arrives", () => {
    for (const quality of ["full", "lite"] as const) {
      const game = newGame(42);
      const group = new Group();
      const st = createSlimeState(group, quality);
      const camera = new PerspectiveCamera(68, 16 / 9, 0.05, 220);
      camera.position.set(0, 1.6, 0);
      camera.updateMatrixWorld();
      const tip = new Vector3(0.2, 1.4, -0.5);
      const seen = new Set<GameEvent["type"]>();
      let puddles = 0;
      let bossSeen = false;
      for (let ms = 0; ms < BOSS_FIRST_MS + 5000 && !game.ended; ms += 1000 / 60) {
        const t = Math.round(ms);
        advance(game, t);
        // Pop each small slime once it's within 7 m, word by word; type the boss's first word.
        for (const s of [...game.slimes]) {
          if (game.ended) break;
          if (s.kind === "small" && s.distMm <= 7000) for (const c of currentWord(s).slice(s.typed)) press(game, c, t);
          if (s.kind === "boss" && s.wordIndex === 0 && ms > BOSS_FIRST_MS + 2000) for (const c of currentWord(s).slice(s.typed)) press(game, c, t);
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

  /** Is the camera outside every slime's jelly (its true, squashed, swelled, tilted ellipsoid), with a margin? */
  function cameraClear(st: ReturnType<typeof createSlimeState>, group: Group, camera: PerspectiveCamera, margin: number): string[] {
    group.updateMatrixWorld(true);
    const bad: string[] = [];
    const inv = new Matrix4();
    const eye = camera.getWorldPosition(new Vector3());
    for (const v of st.views.values()) {
      const jelly = v.body.children[0];
      // In the jelly's own space its skin is a sphere of radius 0.7.
      const local = eye.clone().applyMatrix4(inv.copy(jelly.matrixWorld).invert());
      if (local.length() < 0.7 * margin) bad.push(`${v.boss ? "boss" : "small"} ${v.id} size ${v.size.toFixed(2)}: ${local.length().toFixed(3)}`);
    }
    return bad;
  }

  it("brings unanswered slimes right up to the player, never into the camera, and lets them explode", () => {
    let exploded = 0;
    let nearest = Infinity;
    let biggest = 0;
    const bad: string[] = [];
    // Slimes under size 1.1 are popped at 7 m, so the stuck ones include the largest (up to 1.15).
    const game = newGame(7);
    const group = new Group();
    const st = createSlimeState(group, "full");
    const camera = new PerspectiveCamera(68, 16 / 9, 0.05, 220);
    camera.position.set(0, 1.6, 0);
    for (let ms = 0; ms < BOSS_FIRST_MS && !game.ended; ms += 1000 / 60) {
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
    }
    disposeSlimeState(st);
    expect(exploded).toBeGreaterThanOrEqual(2);
    expect(biggest).toBeGreaterThan(1.1);
    expect(bad.slice(0, 5)).toEqual([]);
    expect(nearest).toBeLessThan(2.2); // still right up close
  });

  it("keeps the camera outside the boss through the whole 3 s stick, letters landing on it included", () => {
    const game = newGame(42);
    const group = new Group();
    const st = createSlimeState(group, "full");
    const camera = new PerspectiveCamera(68, 16 / 9, 0.05, 220);
    camera.position.set(0, 1.6, 0);
    let bossStuckFrames = 0;
    let bossExploded = false;
    const bad: string[] = [];
    for (let ms = 0; ms < BOSS_FIRST_MS + 60000 && !game.ended && !bossExploded; ms += 1000 / 60) {
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
    }
    expect(bossStuckFrames).toBeGreaterThan(150); // most of the 3 s, watched frame by frame
    expect(bossExploded).toBe(true);
    expect(bad.slice(0, 5)).toEqual([]);
    disposeSlimeState(st);
  });
});
