"use client";
import { Component, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import type { Game, GameEvent } from "../../game/engine";
import { SKY, css } from "../../game/palette";
import { slowTracker, type Quality } from "../../game/quality";
import { Blaster, type BlasterApi } from "./Blaster";
import { drainEvents, safely } from "./sceneEvents";
import { BOSS_DROP_S } from "./slimeFx";
import { Slimes, type SlimesApi } from "./Slimes";
import { WordLabels, type LabelsApi } from "./WordLabels";
import { World } from "./World";

/**
 * Who drains `game.events` (R11): while the scene is mounted and healthy it empties them every
 * frame, before any failure check and outside its GL work, and hands each to `onEvent` (and each
 * `explode` to `onHit`), each call guarded so a caller's bug is logged and never stops the scene.
 * Once the scene has called `onFail`, or while it isn't mounted, it drains nothing: the caller
 * must drain `game.events` itself (or they grow for the rest of the run). With `live` false the
 * scene only drains on the frames it draws.
 */
export type SlimeSceneProps = {
  /** The live game. Only read, apart from draining `events` (see above). */
  game: RefObject<Game | null>;
  /** The current run time in ms, may be fractional: slimes are extrapolated between engine ticks. */
  clock: () => number;
  quality: Quality;
  /** The locked slime (the scene also reads `game.lock` every frame; this only triggers a redraw when idle). */
  lockId: number | null;
  /** The run is on: draw every frame and watch the frame times. Otherwise draw on demand. Default true. */
  live?: boolean;
  /** A slime exploded on the player: the HUD's goo flash. Guarded: a throw is logged. */
  onHit?: () => void;
  /** Every engine event, as the scene drains it from `game.events` (sound goes here). Guarded: a throw is logged. */
  onEvent?: (e: GameEvent) => void;
  /** Frames have been too slow at `full` for 2 s (once per mount): switch to `lite`. */
  onSlow?: () => void;
  /** The scene broke (an exception, a lost WebGL context): it draws nothing more, and from now on the caller drains `game.events`. */
  onFail?: () => void;
};

/** Eye height, m. */
const EYE_Y = 1.6;
const PITCH = -0.06;
/** The camera turns this share of the locked slime's lane angle ... */
const YAW_SHARE = 0.6;
/** ... but never so far that a slime on the far edge (30° plus this margin) leaves the view. */
const EDGE_DEG = 35;
const BASE_FOV = 68;
const MAX_FOV = 85;
/** A narrow view widens its vertical field until it shows at least ±40° across. */
const MIN_HALF_ACROSS_DEG = 40;

/** Vertical fov for an aspect: 68° on a wide screen, wider on a narrow one, at most 85°. */
function fovFor(aspect: number): number {
  const need = 2 * MathUtils.radToDeg(Math.atan(Math.tan(MathUtils.degToRad(MIN_HALF_ACROSS_DEG)) / aspect));
  return Math.min(MAX_FOV, Math.max(BASE_FOV, need));
}

/** The camera, the frame loop and the scene's parts, inside the Canvas. */
function Rig(props: SlimeSceneProps & { labels: RefObject<LabelsApi | null> }) {
  const { quality, lockId } = props;
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const slimes = useRef<SlimesApi>(null);
  const blaster = useRef<BlasterApi>(null);
  const latest = useRef(props);
  useEffect(() => { latest.current = props; });
  const view = useRef({ yaw: 0, shake: 0, thumpAt: null as number | null, slowSaid: false, failed: false });
  const tracker = useRef(slowTracker());
  const tip = useRef(new Vector3());

  // A fresh frame watch for each run; a redraw for what changes while idle (demand mode).
  useEffect(() => { if (props.live !== false) tracker.current = slowTracker(); }, [props.live]);
  useEffect(() => { invalidate(); }, [lockId, quality, invalidate]);

  const fail = () => {
    const v = view.current;
    if (v.failed) return;
    v.failed = true;
    safely(latest.current.onFail);
  };

  // A context lost while the scene is up leaves a dead canvas. The listener goes with the scene,
  // because unmounting makes R3F lose the context on purpose, and that is not a failure.
  useEffect(() => {
    const el = gl.domElement;
    let alive = true;
    const lost = (e: Event) => {
      e.preventDefault();
      if (alive) fail();
    };
    el.addEventListener("webglcontextlost", lost);
    return () => { alive = false; el.removeEventListener("webglcontextlost", lost); };
  }, [gl]);

  /** The GL side of a frame; `events` were drained (and forwarded) just before. */
  const frame = (state: RootState, delta: number, events: readonly GameEvent[]) => {
    const p = latest.current;
    const v = view.current;
    const camera = state.camera as PerspectiveCamera;
    const dt = Math.min(delta, 0.1);
    const t = state.clock.elapsedTime;
    const full = p.quality === "full";
    const g = p.game.current;

    // Lens for this shape of view.
    const aspect = state.size.width / Math.max(1, state.size.height);
    const fov = fovFor(aspect);
    if (Math.abs(camera.fov - fov) > 0.01 || Math.abs(camera.aspect - aspect) > 0.001) {
      camera.fov = fov;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }

    // The scene's own reactions to what happened since the last frame.
    for (const e of events) {
      if (e.type === "pop") blaster.current?.fire(1);
      else if (e.type === "word") blaster.current?.fire(0.8);
      else if (e.type === "letter") blaster.current?.kick(0.22);
      else if (e.type === "wrong") blaster.current?.jolt();
      else if (e.type === "explode") {
        if (full) v.shake = Math.max(v.shake, 0.45);
      } else if (e.type === "boss") v.thumpAt = t + BOSS_DROP_S;
    }
    if (v.thumpAt !== null && t >= v.thumpAt) {
      if (full) v.shake = Math.max(v.shake, 0.3);
      v.thumpAt = null;
    }

    const runMs = p.clock();
    if (blaster.current) blaster.current.tip(tip.current);
    if (g) slimes.current?.update({ t, dt, runMs, game: g, quality: p.quality, camera, tip: tip.current }, events);

    // Ease the view toward the locked slime; back to the middle with none.
    const locked = g && g.lock !== null ? g.slimes.find((s) => s.id === g.lock) : undefined;
    const halfAcross = Math.atan(Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const maxYaw = Math.max(0, halfAcross - MathUtils.degToRad(EDGE_DEG));
    const target = locked ? MathUtils.clamp(-MathUtils.degToRad(locked.lane) * YAW_SHARE, -maxYaw, maxYaw) : 0;
    v.yaw = MathUtils.damp(v.yaw, target, 4, dt);
    v.shake = Math.max(0, v.shake - dt);
    const sway = full ? 1 : 0;
    const jitter = () => (Math.random() - 0.5) * v.shake * 0.1;
    camera.position.set(0, EYE_Y, 0);
    camera.rotation.set(
      PITCH + Math.sin(t * 1.7) * 0.004 * sway + jitter(),
      v.yaw + Math.sin(t * 1.1) * 0.003 * sway + jitter(),
      0,
      "YXZ",
    );
    camera.updateMatrixWorld();

    blaster.current?.update({ t, dt, camera, quality: p.quality, look: locked ? locked.look : null });
    p.labels.current?.update({
      slimes: g ? g.slimes : [], heads: slimes.current?.heads() ?? new Map(), camera,
      w: state.size.width, h: state.size.height, lock: g ? g.lock : null, dt,
    });

    if (p.live !== false && full && !v.slowSaid && tracker.current.frame(performance.now(), delta * 1000)) {
      v.slowSaid = true;
      safely(p.onSlow);
    }
  };

  useFrame((state, delta) => {
    if (view.current.failed) return; // the caller drains game.events from here on (R11)
    const p = latest.current;
    // Events first, outside the GL work: a scene fault this frame still delivers them.
    const events = drainEvents(p.game.current, p);
    // An exception in the frame loop bypasses the error boundary: report it from here.
    try {
      frame(state, delta, events);
    } catch (e) {
      console.error(e);
      fail();
    }
  });

  return (
    <>
      <World quality={quality} />
      <Slimes ref={slimes} quality={quality} />
      <Blaster ref={blaster} />
    </>
  );
}

/** A scene that throws (a shader error, a render fault) must not take the run screen with it. */
class Guard extends Component<{ onError?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { safely(this.props.onError); }
  render() { return this.state.failed ? null : this.props.children; }
}

/**
 * The slime world (D793), first person at eye height: the low-poly pastel field, the slimes
 * hopping in from ahead, the blaster in the lower right and the word bubbles over the slimes.
 * Fills its (positioned) parent. Decoration for pointers and screen readers: the typing and the
 * HUD live outside it. Loaded with `next/dynamic(..., { ssr: false })`; the caller checks
 * `hasWebGL()` first.
 *
 * The scene reads `game.current` every frame and drains `game.current.events` (each is passed to
 * `onEvent`); it never writes anything else to the Game. `lite` halves the world, drops shadows
 * and draws at 1× pixels.
 */
export default function SlimeScene(props: SlimeSceneProps) {
  const labels = useRef<LabelsApi>(null);
  const live = props.live !== false;
  const full = props.quality === "full";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: css(SKY) }}>
      <Guard onError={props.onFail}>
        <Canvas
          frameloop={live ? "always" : "demand"}
          dpr={full ? [1, 1.75] : 1}
          shadows="percentage"
          camera={{ fov: BASE_FOV, near: 0.05, far: 220, position: [0, EYE_Y, 0], rotation: [PITCH, 0, 0] }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <Rig {...props} labels={labels} />
        </Canvas>
      </Guard>
      <WordLabels ref={labels} />
    </div>
  );
}
