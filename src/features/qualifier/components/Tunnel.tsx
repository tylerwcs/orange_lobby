"use client";
import { Component, useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { mayMount3D, mayPreload, tunnelMode } from "../tunnel-mode";
import { Tunnel2D, type Tunnel2DProps } from "./Tunnel2D";

/**
 * The gate tunnel (D773): the 3D scene when the device can draw it, otherwise `Tunnel2D`. The 3D
 * scene is decoration and must never delay the typing box, so:
 * - it is a separate chunk (three is not in the page's first load), warmed by `preloadTunnel3D`
 *   in idle time between runs, never during one;
 * - `Tunnel` mounts it only once that chunk has loaded and only before the sprint (creating the
 *   canvas and compiling shaders is a long task); a run it missed stays 2D;
 * - the 2D strip stands in until its first frame.
 * It stays 2D when the viewer asks for reduced motion, when WebGL can't be created, when the
 * scene fails, and for the rest of the page's life once frames have been too slow.
 */
const Tunnel3D = dynamic(() => import("./Tunnel3D").then((m) => m.Tunnel3D), { ssr: false, loading: () => null });

const REDUCED = "(prefers-reduced-motion: reduce)";
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia(REDUCED).matches;
function subscribeReduced(onChange: () => void) {
  const q = window.matchMedia(REDUCED);
  q.addEventListener("change", onChange);
  return () => q.removeEventListener("change", onChange);
}

/** three needs WebGL 2. Probed once, by the warm-up; the probe context is released at once. */
let webgl: boolean | null = null;
function probeWebgl(): boolean {
  if (webgl !== null) return webgl;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    webgl = gl !== null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

/** Set when 3D has been too slow (or broke): the rest of this page session stays 2D. */
let slowSeen = false;

/** Set once the 3D chunk has been fetched and evaluated (by the warm-up). */
let chunkLoaded = false;
const loadedListeners = new Set<() => void>();
const subscribeLoaded = (fn: () => void) => { loadedListeners.add(fn); return () => { loadedListeners.delete(fn); }; };

/**
 * Warm the 3D chunk: fetch it and check WebGL, drawing nothing. The client calls it in idle time
 * while no run is on (`running` false); it does nothing during a run, for reduced motion, or
 * once 3D has proved too slow.
 */
export function preloadTunnel3D(running: boolean) {
  if (chunkLoaded || !mayPreload({ running, reducedMotion: reducedMotion(), slow: slowSeen })) return;
  if (!probeWebgl()) return;
  import("./Tunnel3D").then(() => {
    chunkLoaded = true;
    loadedListeners.forEach((fn) => fn());
  }, () => {}); // a failed fetch just leaves the tunnel 2D
}

/** A 3D scene that throws (a shader error, a render fault) must not take the run screen with it. */
class Guard extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** `sprint`: the 30 s are running (the 3D canvas then draws every frame and watches its speed). */
export function Tunnel(props: Tunnel2DProps & { sprint?: boolean }) {
  const reduced = useSyncExternalStore(subscribeReduced, reducedMotion, () => true);
  const loaded = useSyncExternalStore(subscribeLoaded, () => chunkLoaded, () => false);
  const [slow, setSlow] = useState(slowSeen);
  const [mounted, setMounted] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const giveUp = useCallback(() => { slowSeen = true; setSlow(true); }, []);
  const onDrawn = useCallback(() => setDrawn(true), []);
  const { sprint, ...tunnel } = props;

  // WebGL is not asked here: `loaded` is only ever true after the warm-up found WebGL 2 usable.
  if (tunnelMode({ reducedMotion: reduced, webgl: true, slow }) === "2d") return <Tunnel2D {...tunnel} />;
  const show3D = mayMount3D({ sprint: sprint === true, loaded, mounted });
  if (show3D && !mounted) setMounted(true); // latched: mounted before the sprint, it stays through it
  return (
    <div className="relative h-20 w-full">
      {!(drawn && show3D) && <Tunnel2D {...tunnel} />}
      {show3D && (
        <Guard onError={giveUp}>
          <Tunnel3D {...tunnel} sprint={sprint} onSlow={giveUp} onDrawn={onDrawn} />
        </Guard>
      )}
    </div>
  );
}
