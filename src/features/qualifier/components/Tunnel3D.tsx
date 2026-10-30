"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ConeGeometry, ExtrudeGeometry, MathUtils, Shape, type Mesh, type MeshBasicMaterial } from "three";
import { skinColour } from "../screen";
import { slowTracker } from "../tunnel-mode";
import { CUT_COLOUR, type Tunnel2DProps } from "./Tunnel2D";

export type Tunnel3DProps = Tunnel2DProps & {
  /** The sprint is running: the canvas draws every frame, and frame times are watched. */
  sprint?: boolean;
  /** Frames are too slow (or the context was lost): the caller shows the 2D tunnel instead. */
  onSlow: () => void;
  /** The first frame is on screen, so the 2D stand-in underneath can go. */
  onDrawn?: () => void;
};

/** World units between two gates; gate k sits at z = -k * GAP, where word k is finished. */
const GAP = 4.5;
const GATES = 14;
const SHIP_AHEAD = 3.4; // the ship flies this far in front of the camera
/** The ease of the camera through a gate, and of a ghost along the tunnel (per second). */
const EASE = 7;
const GATE_W = 8;
const GATE_H = 3.6;
const GATE_R = 1;
const GATE_THICK = 0.22;
/** Gates take the portal theme's primary colour; this is the default when it exposes none. */
const GATE_DEFAULT = "#8b5cf6";

/** The theme's primary colour as hex, whatever syntax the CSS holds it in (oklch, hsl, ...). */
function themeColour(el: Element): string {
  try {
    const raw = getComputedStyle(el).getPropertyValue("--primary").trim();
    if (!raw) return GATE_DEFAULT;
    const px = document.createElement("canvas");
    px.width = px.height = 1;
    const ctx = px.getContext("2d", { willReadFrequently: true });
    if (!ctx) return GATE_DEFAULT;
    ctx.fillStyle = raw; // the canvas does the colour conversion
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return GATE_DEFAULT;
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return GATE_DEFAULT;
  }
}

function roundedRect(s: Shape, w: number, h: number, r: number) {
  const x = w / 2, y = h / 2;
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
}

/** A rounded-rectangle ring, the outline of one gate. */
function gateGeometry() {
  const outer = new Shape();
  roundedRect(outer, GATE_W, GATE_H, GATE_R);
  const hole = new Shape();
  roundedRect(hole, GATE_W - 2 * GATE_THICK, GATE_H - 2 * GATE_THICK, GATE_R - GATE_THICK / 2);
  outer.holes.push(hole);
  return new ExtrudeGeometry(outer, { depth: 0.12, bevelEnabled: false, curveSegments: 6 });
}

/** A low-poly dart pointing down -z. */
function shipGeometry() {
  const g = new ConeGeometry(0.5, 1.5, 4);
  g.rotateX(-Math.PI / 2);
  g.scale(1, 0.45, 1);
  return g;
}

/** A ghost's place relative to the camera in gates, kept inside the view like the 2D strip's edge. */
const ghostRel = (words: number, cam: number) => MathUtils.clamp(words - cam, -0.2, GATES - 3);

function Scene({ progress, best, cut, skin, sprint, onSlow, onDrawn }: {
  progress: number; best: number | null; cut: number | null; skin: Tunnel2DProps["skin"];
  sprint: boolean; onSlow: () => void; onDrawn: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const gates = useRef<(Mesh | null)[]>([]);
  const ship = useRef<Mesh>(null);
  const bestShip = useRef<Mesh>(null);
  const cutShip = useRef<Mesh>(null);
  const cam = useRef(0); // the camera's progress in words, eased towards `progress`
  const bestAt = useRef<number | null>(null);
  const cutAt = useRef<number | null>(null);
  const tracker = useRef(slowTracker());
  const drawn = useRef(false);
  // What the frame loop reads: updated after each render, never during it.
  const latest = useRef({ progress, best, cut, sprint, onSlow, onDrawn });
  useEffect(() => { latest.current = { progress, best, cut, sprint, onSlow, onDrawn }; });

  const gateGeo = useMemo(() => gateGeometry(), []);
  const shipGeo = useMemo(() => shipGeometry(), []);
  useEffect(() => () => { gateGeo.dispose(); shipGeo.dispose(); }, [gateGeo, shipGeo]);
  const theme = useMemo(() => themeColour(gl.domElement), [gl]);
  const mine = skinColour(skin);

  // A fresh watch for each sprint, and a redraw whenever the numbers change (demand mode).
  useEffect(() => { if (sprint) tracker.current = slowTracker(); }, [sprint]);
  useEffect(() => { invalidate(); }, [progress, best, cut, invalidate]);

  useFrame((state, delta) => {
    const { progress: goal, best: bestGoal, cut: cutGoal, sprint: racing } = latest.current;
    const dt = Math.min(delta, 0.1);
    cam.current = MathUtils.damp(cam.current, goal, EASE, dt);
    let moving = Math.abs(goal - cam.current) > 0.002;
    const camZ = -cam.current * GAP;
    state.camera.position.z = camZ;

    // Gate k lives in slot k mod GATES; gates behind the camera are hidden.
    const base = Math.floor(cam.current);
    gates.current.forEach((mesh, s) => {
      if (!mesh) return;
      const k = base + ((((s - base) % GATES) + GATES) % GATES);
      const ahead = k - cam.current; // in gates
      mesh.visible = k >= 1 && ahead > 0.15;
      mesh.position.z = -k * GAP;
      (mesh.material as MeshBasicMaterial).opacity = MathUtils.clamp(1 - ahead / GATES, 0, 1) ** 1.6;
    });

    const bob = Math.sin(state.clock.elapsedTime * 3) * 0.04;
    ship.current?.position.set(0, bob, camZ - SHIP_AHEAD);
    const place = (mesh: Mesh | null, at: { current: number | null }, words: number | null, x: number, y: number) => {
      if (!mesh) return;
      if (words === null) { mesh.visible = false; return; }
      at.current = at.current === null ? words : MathUtils.damp(at.current, words, EASE, dt);
      if (Math.abs(words - at.current) > 0.002) moving = true;
      mesh.visible = true;
      mesh.position.set(x, y + bob, -(cam.current + ghostRel(at.current, cam.current)) * GAP - SHIP_AHEAD);
    };
    place(bestShip.current, bestAt, bestGoal, -1.7, -0.75);
    place(cutShip.current, cutAt, cutGoal, 1.7, 0.75);

    if (!drawn.current) {
      drawn.current = true;
      latest.current.onDrawn();
    }
    if (racing) {
      if (tracker.current.frame(performance.now(), delta * 1000)) latest.current.onSlow();
    } else if (moving) {
      invalidate(); // demand mode: keep drawing until the ease has settled
    }
  });

  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[2, 3, 4]} intensity={2} />
      {Array.from({ length: GATES }, (_, s) => (
        <mesh key={s} ref={(m) => { gates.current[s] = m; }} geometry={gateGeo} position={[0, 0, -s * GAP]}>
          <meshBasicMaterial color={theme} transparent depthWrite={false} />
        </mesh>
      ))}
      <mesh ref={bestShip} geometry={shipGeo} visible={false}>
        <meshStandardMaterial color={mine} flatShading transparent opacity={0.4} depthWrite={false} />
      </mesh>
      <mesh ref={cutShip} geometry={shipGeo} visible={false}>
        <meshStandardMaterial color={CUT_COLOUR} flatShading transparent opacity={0.4} depthWrite={false} />
      </mesh>
      <mesh ref={ship} geometry={shipGeo}>
        <meshStandardMaterial color={mine} flatShading />
      </mesh>
    </>
  );
}

/**
 * The 3D gate tunnel (D773): a canvas filling the same strip as `Tunnel2D`, with the same props.
 * Rounded-rect gates recede down -z, one per word; the camera eases through a gate as each word
 * is finished and the ship flies ahead of it. The player's best run and the #10 run are
 * translucent ships. Decoration only: it ignores pointers, is hidden from screen readers, and
 * `Tunnel` loads it only once the typing box is up. It draws every frame during the sprint (and
 * watches the frame times) and only on demand otherwise.
 */
function Tunnel3DView({ progress, ghosts, skin, sprint = false, onSlow, onDrawn }: Tunnel3DProps) {
  const [shown, setShown] = useState(false);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl bg-muted"
      // Held back until the first frame is drawn, so the 2D strip underneath never shows through.
      style={{ opacity: shown ? 1 : 0 }}>
      <Canvas
        frameloop={sprint ? "always" : "demand"}
        dpr={[1, 1.5]}
        camera={{ fov: 55, near: 0.1, far: GATES * GAP + 10, position: [0, 0, 0] }}
        gl={{ antialias: true, alpha: true }}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        onCreated={({ gl }) => {
          // A lost context leaves a dead canvas: show the 2D tunnel instead.
          gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); onSlow(); });
        }}
      >
        <Scene progress={progress} best={ghosts.best} cut={ghosts.cut} skin={skin} sprint={sprint} onSlow={onSlow}
          onDrawn={() => { setShown(true); onDrawn?.(); }} />
      </Canvas>
    </div>
  );
}

/** Re-renders only for what the scene shows, not for the page's 100 ms clock ticks. */
export const Tunnel3D = memo(Tunnel3DView, (a, b) =>
  a.progress === b.progress && a.ghosts.best === b.ghosts.best && a.ghosts.cut === b.ghosts.cut &&
  a.skin === b.skin && a.sprint === b.sprint && a.onSlow === b.onSlow && a.onDrawn === b.onDrawn);
