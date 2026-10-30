"use client";
import { Component, useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { tunnelMode } from "../tunnel-mode";
import { Tunnel2D, type Tunnel2DProps } from "./Tunnel2D";

/**
 * The gate tunnel (D773): the 3D scene when the device can draw it, otherwise `Tunnel2D`. The 3D
 * scene is decoration and must never delay the typing box, so it is a separate chunk (three is
 * not in the page's first load), fetched with `next/dynamic` only once this renders, and the 2D
 * strip stands in until its first frame. It stays 2D when the viewer asks for reduced motion,
 * when WebGL can't be created, when the chunk fails to load, and for the rest of the page's life
 * once frames have been too slow.
 */
const Tunnel3D = dynamic(() => import("./Tunnel3D").then((m) => m.Tunnel3D), { ssr: false, loading: () => null });

/** Warm the 3D chunk without drawing anything. The client calls it once the typing box is up. */
export function preloadTunnel3D() {
  if (reducedMotion() || !webglAvailable() || slowSeen) return;
  void import("./Tunnel3D").catch(() => {}); // a failure shows itself later, as the 2D tunnel
}

const REDUCED = "(prefers-reduced-motion: reduce)";
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia(REDUCED).matches;
function subscribeReduced(onChange: () => void) {
  const q = window.matchMedia(REDUCED);
  q.addEventListener("change", onChange);
  return () => q.removeEventListener("change", onChange);
}
const noSubscribe = () => () => {};

/** three needs WebGL 2. Probed once; the probe context is released at once. */
let webgl: boolean | null = null;
function webglAvailable(): boolean {
  if (webgl !== null) return webgl;
  if (typeof document === "undefined") return false;
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

/** A 3D scene that throws (a failed chunk, a shader error) must not take the run screen with it. */
class Guard extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** `sprint`: the 30 s are running (the 3D canvas then draws every frame and watches its speed). */
export function Tunnel(props: Tunnel2DProps & { sprint?: boolean }) {
  const reduced = useSyncExternalStore(subscribeReduced, reducedMotion, () => true);
  const canGL = useSyncExternalStore(noSubscribe, webglAvailable, () => false);
  const [slow, setSlow] = useState(slowSeen);
  const [drawn, setDrawn] = useState(false);
  const giveUp = useCallback(() => { slowSeen = true; setSlow(true); }, []);
  const onDrawn = useCallback(() => setDrawn(true), []);
  const { sprint, ...tunnel } = props;

  if (tunnelMode({ reducedMotion: reduced, webgl: canGL, slow }) === "2d") return <Tunnel2D {...tunnel} />;
  return (
    <div className="relative h-20 w-full">
      {!drawn && <Tunnel2D {...tunnel} />}
      <Guard onError={giveUp}>
        <Tunnel3D {...tunnel} sprint={sprint} onSlow={giveUp} onDrawn={onDrawn} />
      </Guard>
    </div>
  );
}
