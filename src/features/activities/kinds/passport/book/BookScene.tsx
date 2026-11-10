"use client";
import { Component, useEffect, useImperativeHandle, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { curlPoints, leafPages, turnedLeaves } from "./leaf";
import { paintPage, pageSize, type PageData, type PageKey } from "./pages";
import { drawStamp } from "./paint";
import { stampSpot } from "./stamp-spots";
import { PAGE } from "./geometry";

/** What the book's wrapper asks of the scene: where a tap landed, and which way to lean. */
export type BookSceneApi = {
  hit: (clientX: number, clientY: number) => { page: "top" } | { page: "bottom"; u: number; v: number } | null;
  lean: (x: number, y: number) => void;
};

export type BookSceneProps = {
  data: PageData;
  img: (url: string | null) => HTMLImageElement | null;
  /** Changes whenever an image or a font lands. */
  repaint: number;
  /** Room for the "YOU'RE A" banner above the open passport (D875). */
  banner: boolean;
  api: RefObject<BookSceneApi | null>;
  /** The name page's place on screen, for the name field laid over it (D874); null when not showing. */
  onNameRect: (r: { left: number; top: number; width: number; height: number } | null) => void;
  /** The stamp page's place on screen once the passport is finished, for the reveal's landing slot (D878). */
  onTopRect: (r: { left: number; top: number; width: number; height: number } | null) => void;
  /** Goes up each time a stamp is pressed in: the passport dips a little (D878). */
  press: number;
  onReady: () => void;
  onFail: () => void;
};

// The booklet, in world units (sketch v3): a landscape spread hinged along its top edge.
const W = 3.04, H = 2.14, PW = W - 0.08, PH = H - 0.06, DZ = 0.004, SEG = 16;
const FOV = 35, CAM_Z = 10.8;
const PAGE_MS = 720, COVER_MS = 1000;

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/**
 * D870–D873, D877, D878: the passport in 3D. A top-hinged booklet turned 90° so it starts as a
 * closed portrait passport (spine left), opens like a book, then turns to the stacked spread:
 * the top page above, the bottom page below. Pages are the same canvases the flat book paints,
 * as textures; only leaves near the open spread hold them (D889), the rest are plain paper.
 * Pages bend as they turn (`curlPoints`); the cover stays stiff.
 */
export default function BookScene(props: BookSceneProps) {
  return (
    <SceneGuard onFail={props.onFail}>
      <Canvas
        flat frameloop="demand" dpr={[1, 1.5]}
        camera={{ fov: FOV, near: 0.1, far: 100, position: [0, 0, CAM_Z] }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ position: "absolute", inset: 0, touchAction: "manipulation" }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); props.onFail(); }, { once: true });
        }}
      >
        <hemisphereLight args={[0xffffff, 0x334466, 1.5]} />
        <directionalLight color={0xfff4e0} intensity={1.5} position={[-3, 4, 6]} />
        <Book {...props} />
      </Canvas>
    </SceneGuard>
  );
}

class SceneGuard extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}

type Variant = "plain" | "back" | "cover" | "boxBack";
type Tex = { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; sig: string };
type LeafAnim = { f: number; from: number; to: number; t0: number; dur: number; dir: 1 | -1 };
type Leaf = {
  group: THREE.Group;
  front: THREE.Mesh;
  back: THREE.Mesh;
  geo: THREE.PlaneGeometry | null;
  pages: { front: PageKey; back: PageKey };
  anim: LeafAnim;
  bent: number;
};

function Book({ data, img, repaint, banner, api, onNameRect, onTopRect, press, onReady }: BookSceneProps) {
  const { camera, size, gl, invalidate } = useThree();
  // Keyed on the test's shape, not its identity: a refresh after each landed stamp brings a new
  // object, and the scene must not be rebuilt (and its settle dropped) for that.
  const testOn = data.test.on;
  const questionCount = data.test.questions.length;
  const pages = useMemo(() => leafPages(testOn, questionCount), [testOn, questionCount]);
  const lastTop = useRef("");
  const dip = useRef({ t0: -1 });
  // Something changed outside the frame loop (a page, the banner, a press): draw again.
  useEffect(() => { invalidate(); });
  // A phone back from another app (or a resized window) must show the passport, not a blank canvas.
  useEffect(() => {
    const redraw = () => invalidate();
    document.addEventListener("visibilitychange", redraw);
    window.addEventListener("resize", redraw);
    return () => { document.removeEventListener("visibilitychange", redraw); window.removeEventListener("resize", redraw); };
  }, [invalidate]);
  useEffect(() => { if (press > 0) { dip.current.t0 = performance.now(); invalidate(); } }, [press, invalidate]);
  const textures = useRef(new Map<string, Tex>());
  const ready = useRef(false);
  const lastRect = useRef("");
  const lean = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const turned = turnedLeaves(data.flow, pages.length);
  // A returning guest sees the finished passport at once (D882): no cover animation.
  const pose = useRef(turned > 0
    ? { y: 0, s: 1, rx: 0, ry: 0, turn: 0, bob: 0, lean: 0.35 }
    : { y: 0, s: 1.17, rx: -0.12, ry: 0.3, turn: Math.PI / 2, bob: 1, lean: 1 });
  const tweens = useRef<{ t0: number; dur: number; apply: (e: number) => void }[]>([]);
  const settle = useRef<{ mesh: THREE.Mesh; t0: number; skip: string } | null>(null);
  const stampCount = useRef<number | null>(null);

  // The fixed parts and one group per leaf, built once per test shape.
  const built = useMemo(() => {
    const coverSide = new THREE.MeshStandardMaterial({ color: data.coverColour, roughness: 0.7 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xefe6d2, roughness: 0.95 });
    const holderMat = new THREE.MeshStandardMaterial({ roughness: 0.95, emissive: 0xffffff, emissiveIntensity: 0.25 });
    const root = new THREE.Group();
    const turn = new THREE.Group(); root.add(turn);
    const book = new THREE.Group(); turn.add(book);
    const backCover = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.03), coverSide);
    backCover.position.set(0, -H / 2, -0.045); book.add(backCover);
    const block = new THREE.Mesh(new THREE.BoxGeometry(PW, PH, 0.06), [paper, paper, paper, paper, holderMat, paper]);
    block.position.set(0, -H / 2 + 0.02, 0); book.add(block);

    const leaves: Leaf[] = pages.map((p, k) => {
      const group = new THREE.Group(); book.add(group);
      const f = k < turned ? 1 : 0;
      const anim: LeafAnim = { f, from: f, to: f, t0: 0, dur: PAGE_MS, dir: 1 };
      if (k === 0) {
        const frontMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
        const backMat = new THREE.MeshStandardMaterial({ roughness: 0.95, emissive: 0xffffff, emissiveIntensity: 0.25 });
        const box = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.03), [coverSide, coverSide, coverSide, coverSide, frontMat, backMat]);
        box.position.set(0, -H / 2, 0.017); group.add(box);
        return { group, front: box, back: box, geo: null, pages: p, anim, bent: -1 };
      }
      const geo = new THREE.PlaneGeometry(PW, PH, 1, SEG);
      const frontMat = new THREE.MeshStandardMaterial({ roughness: 0.95, emissive: 0xffffff, emissiveIntensity: 0.25, side: THREE.FrontSide });
      const backMat = new THREE.MeshStandardMaterial({ roughness: 0.95, emissive: 0xffffff, emissiveIntensity: 0.25, side: THREE.BackSide });
      const front = new THREE.Mesh(geo, frontMat); const back = new THREE.Mesh(geo, backMat);
      front.position.y = -0.01; back.position.y = -0.01;
      group.add(front, back);
      return { group, front, back, geo, pages: p, anim, bent: -1 };
    });

    // A soft shadow under the booklet.
    const sc = document.createElement("canvas"); sc.width = sc.height = 256;
    const sx = sc.getContext("2d")!;
    const g = sx.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, "rgba(0,0,0,.55)"); g.addColorStop(1, "rgba(0,0,0,0)");
    sx.fillStyle = g; sx.fillRect(0, 0, 256, 256);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(W + 1.4, H + 1.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    book.add(shadow);
    return { root, turn, book, leaves, shadow, coverSide, paper, holderMat, block };
    // The test's shape decides the leaves; its colours are applied each frame below.
  }, [pages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    for (const t of textures.current.values()) t.tex.dispose();
    textures.current.clear();
    built.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); });
      }
    });
  }, [built]);

  // Leaf targets follow the flow. Opening the cover is choreographed (D871); every other turn is one page.
  useEffect(() => {
    const now = performance.now();
    const L0 = built.leaves[0];
    if (turned > 0 && L0.anim.to === 0) {
      const p = pose.current;
      const from = { ...p };
      tweens.current.push({ t0: now, dur: 500, apply: (e) => { p.rx = from.rx * (1 - e); p.ry = from.ry * (1 - e); p.bob = 1 - e; } });
      Object.assign(L0.anim, { from: L0.anim.f, to: 1, t0: now + 500, dur: COVER_MS, dir: 1 });
      tweens.current.push({ t0: now + 500, dur: COVER_MS, apply: (e) => { p.s = 1.17 - 0.45 * e; } });
      tweens.current.push({ t0: now + 500 + COVER_MS + 250, dur: 900, apply: (e) => { p.turn = (Math.PI / 2) * (1 - e); p.s = 0.72 + 0.28 * e; p.lean = 1 - 0.65 * e; } });
    }
    built.leaves.forEach((L, k) => {
      if (k === 0) return;
      const to = k < turned ? 1 : 0;
      if (L.anim.to === to) return;
      Object.assign(L.anim, { from: L.anim.f, to, t0: now, dur: PAGE_MS, dir: to > L.anim.f ? 1 : -1 });
    });
  }, [turned, built]);

  const busy = () => {
    const now = performance.now();
    return built.leaves.some((L) => L.anim.f !== L.anim.to || now < L.anim.t0) || tweens.current.length > 0;
  };

  // Taps: the top page goes back, the bottom page answers (D872); the closed cover opens.
  const ray = useMemo(() => ({ caster: new THREE.Raycaster(), ndc: new THREE.Vector2() }), []);
  useImperativeHandle(api, () => ({
      lean: (x, y) => { lean.current.tx = x; lean.current.ty = y; invalidate(); },
      hit: (cx, cy) => {
        if (busy()) return null;
        const r = gl.domElement.getBoundingClientRect();
        const { caster, ndc } = ray;
        ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
        caster.setFromCamera(ndc, camera);
        const t = turnedLeaves(data.flow, pages.length);
        if (t === 0) return caster.intersectObject(built.leaves[0].front, false).length ? { page: "bottom", u: 0.5, v: 0.5 } : null;
        const targets: THREE.Object3D[] = [];
        const bottom = t < built.leaves.length ? built.leaves[t].front : null;
        const top = built.leaves[t - 1].back;
        if (bottom) targets.push(bottom);
        targets.push(top);
        const h = caster.intersectObjects(targets, false)[0];
        if (!h) return null;
        if (h.object === top && h.object !== bottom) return { page: "top" };
        return h.uv ? { page: "bottom", u: h.uv.x, v: h.uv.y } : null;
      },
  }));

  // Textures: only the leaves either side of the open spread hold their pages (D889).
  function texFor(key: PageKey, variant: Variant): Tex {
    const id = `${key}|${variant}`;
    let t = textures.current.get(id);
    if (!t) {
      const canvas = document.createElement("canvas");
      const { w, h } = pageSize(key);
      canvas.width = w; canvas.height = h;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
      if (variant === "back") tex.flipY = false;
      if (variant === "cover" || variant === "boxBack") { tex.center.set(0.5, 0.5); tex.rotation = variant === "cover" ? -Math.PI / 2 : Math.PI; }
      t = { canvas, tex, sig: "" };
      textures.current.set(id, t);
    }
    return t;
  }

  function sig(key: PageKey): string {
    const [kind, n] = key.split(":");
    const i = Number(n);
    const base = `${repaint}`;
    switch (kind) {
      case "cover": return `${base}|${data.coverColour}|${data.eventName}|${!!img(data.crest)}`;
      case "scene": return `${base}|${data.test.questions[i]?.image}|${!!img(data.test.questions[i]?.image ?? null)}`;
      case "question": return `${base}|${data.flow.picks[i]}`;
      case "name": return `${base}|${data.holderName}|${data.paintName}`;
      case "holder": return `${base}|${data.personality?.id}|${data.holderName}|${data.revealProgress.toFixed(3)}`;
      case "stamps": return `${base}|${data.stamps.map((s) => `${s.id}${img(s.image) ? "+" : ""}`).join(",")}|${settle.current?.skip ?? ""}`;
      default: return base;
    }
  }

  function paint(key: PageKey, t: Tex) {
    const s = sig(key);
    if (t.sig === s) return;
    t.sig = s;
    const skip = settle.current?.skip;
    paintPage(key, t.canvas, skip && key === "stamps" ? { ...data, stamps: data.stamps.filter((x) => x.id !== skip) } : data, img);
    t.tex.needsUpdate = true;
  }

  function setMap(mat: THREE.MeshStandardMaterial, t: Tex | null) {
    const map = t?.tex ?? null;
    if (mat.map === map) return;
    mat.map = map; mat.emissiveMap = map;
    mat.color.set(map ? 0xffffff : 0xefe6d2);
    mat.emissiveIntensity = map ? 0.25 : 0;
    mat.needsUpdate = true;
  }

  // D878: a stamp that just landed settles onto its spot, then is baked into the page.
  useEffect(() => {
    const n = data.stamps.length;
    if (stampCount.current === null || data.flow.stage !== "done") { stampCount.current = n; return; }
    if (n <= stampCount.current) { stampCount.current = n; return; }
    stampCount.current = n;
    const s = data.stamps[n - 1];
    const spot = stampSpot(n - 1, data.seed);
    const c = document.createElement("canvas"); c.width = c.height = 320;
    drawStamp(c.getContext("2d")!, { image: img(s.image), name: s.name }, { x: 160, y: 160, rot: spot.rot, scale: spot.scale }, data.chop, data.fonts);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const size = (320 / PAGE.w) * PW;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false }));
    const last = built.leaves.length - 1;
    mesh.position.set(-PW / 2 + (PW * spot.x) / PAGE.w, PH * (1 - spot.y / PAGE.h) - 0.01, zUp(last) + 0.006);
    built.book.add(mesh);
    if (settle.current) built.book.remove(settle.current.mesh);
    settle.current = { mesh, t0: performance.now(), skip: s.id };
  }, [data.stamps, data.flow.stage, data.seed, data.chop, data.fonts, img, built]);

  // eslint-disable-next-line react-hooks/immutability -- the standard R3F pattern: the frame callback moves the memoized three.js scene instead of re-rendering; confined to book/BookScene.
  useFrame(() => {
    const now = performance.now();
    const p = pose.current;
    const NL = built.leaves.length;

    // Tweens (the opening), then leaves.
    tweens.current = tweens.current.filter((tw) => {
      const k = Math.min(1, Math.max(0, (now - tw.t0) / tw.dur));
      if (now >= tw.t0) tw.apply(ease(k));
      return k < 1;
    });
    const cur = turnedLeaves(data.flow, NL);
    built.leaves.forEach((L, k) => {
      const a = L.anim;
      if (a.f !== a.to) {
        const k2 = Math.min(1, Math.max(0, (now - a.t0) / a.dur));
        a.f = a.from + (a.to - a.from) * ease(k2);
        if (k2 >= 1) a.f = a.to;
      }
      const moving = a.f !== a.to;
      const near = Math.abs(k - cur) <= 1 || moving;
      L.group.position.z = zDown(k, NL) + (zUp(k) - zDown(k, NL)) * a.f + Math.sin(Math.PI * a.f) * 0.25;
      if (L.geo) {
        if (L.bent !== a.f) {
          const pts = curlPoints(a.f, a.dir, SEG, PH);
          const pos = L.geo.attributes.position as THREE.BufferAttribute;
          for (let r = 0; r <= SEG; r++) for (let c = 0; c <= 1; c++) pos.setXYZ(r * 2 + c, c === 0 ? -PW / 2 : PW / 2, pts[r].y, pts[r].z);
          pos.needsUpdate = true;
          L.geo.computeVertexNormals(); L.geo.computeBoundingSphere(); L.geo.computeBoundingBox();
          L.bent = a.f;
        }
      } else {
        L.group.rotation.x = -Math.PI * a.f;
      }
      // Pages on show (or about to be) hold their textures; the rest are plain paper.
      const mats = Array.isArray(L.front.material) ? L.front.material : [L.front.material];
      const frontMat = (k === 0 ? mats[4] : mats[0]) as THREE.MeshStandardMaterial;
      const backMat = (k === 0 ? mats[5] : (L.back.material as THREE.MeshStandardMaterial)) as THREE.MeshStandardMaterial;
      if (near) {
        const ft = texFor(L.pages.front, k === 0 ? "cover" : "plain"); paint(L.pages.front, ft); setMap(frontMat, ft);
        const bt = texFor(L.pages.back, k === 0 ? "boxBack" : "back"); paint(L.pages.back, bt); setMap(backMat, bt);
      } else {
        for (const [key, variant, mat] of [[L.pages.front, k === 0 ? "cover" : "plain", frontMat], [L.pages.back, k === 0 ? "boxBack" : "back", backMat]] as const) {
          const id = `${key}|${variant}`;
          const t = textures.current.get(id);
          if (t) { setMap(mat, null); t.tex.dispose(); textures.current.delete(id); }
          if (k === 0 && variant === "cover") { mat.color.set(data.coverColour); }
        }
      }
    });
    const ht = texFor("holder", "plain"); paint("holder", ht); setMap(built.holderMat, ht);
    built.coverSide.color.set(data.coverColour);

    // The settle (D878): 300 ms in, then baked into the page.
    const st = settle.current;
    if (st) {
      const k = Math.min(1, (now - st.t0) / 300);
      st.mesh.scale.setScalar(1.15 - 0.15 * ease(k));
      (st.mesh.material as THREE.MeshBasicMaterial).opacity = ease(k);
      if (k >= 1) {
        built.book.remove(st.mesh);
        st.mesh.geometry.dispose(); (st.mesh.material as THREE.MeshBasicMaterial).map?.dispose(); (st.mesh.material as THREE.MeshBasicMaterial).dispose();
        settle.current = null;
      }
    }

    // Fit the spread to the screen, wherever it is shown.
    const persp = camera as THREE.PerspectiveCamera;
    const visH = 2 * CAM_Z * Math.tan(((persp.fov * Math.PI) / 180) / 2);
    const visW = visH * persp.aspect;
    const fit = Math.min((visW * 0.94) / W, (visH * 0.86) / (2 * H));
    const l = lean.current;
    l.x += (l.tx - l.x) * 0.08; l.y += (l.ty - l.y) * 0.08;
    const lift = banner && cur >= NL ? -visH * 0.07 : 0;
    p.y += (lift - p.y) * 0.08;
    const d = dip.current.t0 < 0 ? 1 : Math.min(1, (now - dip.current.t0) / 280);
    built.root.position.set(0, p.y + Math.sin(now / 700) * 0.06 * p.bob - Math.sin(d * Math.PI) * 0.06, 0);
    built.root.scale.setScalar(p.s * fit);
    built.root.rotation.set(p.rx + l.y * 0.18 * p.lean, p.ry + l.x * 0.3 * p.lean, 0);
    // eslint-disable-next-line react-hooks/immutability -- as above: per-frame three.js mutation.
    built.turn.rotation.z = p.turn;
    const f0 = built.leaves[0].anim.f;
    built.book.position.y = (H / 2) * (1 - f0);
    built.shadow.position.set(0, -H / 2 + (f0 * H) / 2, -0.5);
    built.shadow.scale.set(1, 1 + f0 * 0.95, 1);

    // The name field's place (D874), once the name page is still.
    if (data.flow.stage === "name" && !busy()) {
      const m = built.leaves[NL - 1].front;
      m.updateWorldMatrix(true, false);
      const v = new THREE.Vector3();
      const pts = [[-PW / 2, 0], [PW / 2, -PH]].map(([x, y]) => {
        v.set(x, y, 0).applyMatrix4(m.matrixWorld).project(camera);
        return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
      });
      const rect = { left: Math.min(pts[0][0], pts[1][0]), top: Math.min(pts[0][1], pts[1][1]), width: Math.abs(pts[1][0] - pts[0][0]), height: Math.abs(pts[1][1] - pts[0][1]) };
      const key = [rect.left, rect.top, rect.width, rect.height].map((x) => Math.round(x)).join(",");
      if (key !== lastRect.current) { lastRect.current = key; onNameRect(rect); }
    } else if (lastRect.current) {
      lastRect.current = "";
      onNameRect(null);
    }

    // The stamp page's place (D878), once the finished passport is still.
    if (cur >= NL && !busy()) {
      const L = built.leaves[NL - 1];
      const m = L.back;
      m.updateWorldMatrix(true, false);
      const v = new THREE.Vector3();
      // The stamp page is the last leaf's back: a bent page above the hinge, or the cover box's back.
      const corners = L.geo ? [[-PW / 2, 0, 0], [PW / 2, PH, 0]] : [[-W / 2, -H / 2, -0.015], [W / 2, H / 2, -0.015]];
      const pts = corners.map(([x, y, z]) => {
        v.set(x, y, z).applyMatrix4(m.matrixWorld).project(camera);
        return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
      });
      const rect = { left: Math.min(pts[0][0], pts[1][0]), top: Math.min(pts[0][1], pts[1][1]), width: Math.abs(pts[1][0] - pts[0][0]), height: Math.abs(pts[1][1] - pts[0][1]) };
      const key = [rect.left, rect.top, rect.width, rect.height].map((x) => Math.round(x)).join(",");
      if (key !== lastTop.current) { lastTop.current = key; onTopRect(rect); }
    } else if (lastTop.current) {
      lastTop.current = "";
      onTopRect(null);
    }

    if (!ready.current) { ready.current = true; onReady(); }

    // D889: keep drawing only while something moves - the opening, a turn, the reveal, a settle,
    // the press, the lean easing, the closed passport's float, the banner lift.
    const moving = tweens.current.length > 0 || busy() || !!settle.current || d < 1 || p.bob > 0
      || Math.abs(l.tx - l.x) > 0.002 || Math.abs(l.ty - l.y) > 0.002 || Math.abs(lift - p.y) > 0.002
      || data.flow.stage === "revealing";
    if (moving) invalidate();
  });

  return <primitive object={built.root} />;
}

const zDown = (k: number, NL: number) => 0.031 + (NL - k) * DZ;
const zUp = (k: number) => 0.031 + k * DZ;
