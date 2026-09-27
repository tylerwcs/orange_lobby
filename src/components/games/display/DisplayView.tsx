"use client";
import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";
import type { DisplayState } from "@/lib/games/wire";
import type { Synth } from "@/lib/games/sound";
import { DEFAULT_BACKGROUND } from "@/lib/games/background";
import { gameFont } from "@/lib/games/font";
import { Backdrop } from "./Backdrop";
import { useSoundCues } from "./useSoundCues";
import { DrawScreen } from "./DrawScreen";
import { IdleScreen } from "./IdleScreen";
import { RaceScreen } from "./RaceScreen";
import { SurvivalScreen } from "./SurvivalScreen";

// three.js reaches only this page, and only in the browser (D293).
const Layer3D = dynamic(() => import("./three/Layer3D"), { ssr: false });

let cachedWebGL: boolean | undefined;

/**
 * Probed once and cached at module level: `useSyncExternalStore` calls its snapshot getter on
 * every render, and the LED re-renders on every poll (1–4×/s), so a fresh `getContext` call each
 * time would quickly run into Chrome's ~16 live-WebGL-context limit — eventually evicting
 * Stage3D's own canvas, whose "context lost" handler reloads the page. The probe's own context
 * is released immediately after checking so it never counts toward that limit either.
 */
function hasWebGL(): boolean {
  if (cachedWebGL === undefined) {
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") ?? c.getContext("webgl");
      cachedWebGL = !!gl;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      cachedWebGL = false;
    }
  }
  return cachedWebGL;
}

// Support never changes after load, so there is nothing to subscribe to — only a snapshot to
// read. Reading it via useSyncExternalStore (rather than an effect that calls setState) keeps
// the server's "not yet known" state and the client's real answer from ever fighting each
// other; null renders neither the 3D layer nor the fallback message until the client has
// actually checked (matching the SSR pass, which cannot check at all).
const noWebGLUpdates = () => () => {};
function useHasWebGL(): boolean | null {
  return useSyncExternalStore<boolean | null>(noWebGLUpdates, hasWebGL, () => null);
}

/**
 * The LED's picture on the 1920×1080 canvas: background, 3D layer, the HTML screen on top, and
 * the logo in the corner on Theme. The same for the live display and the ?test self-test.
 */
export function DisplayView({ state, offset, synth }: { state: DisplayState; offset: number; synth: Synth }) {
  const [failed, setFailed] = useState<string | null>(null);
  const webgl = useHasWebGL();
  useSoundCues(state, offset, synth);
  const look = failed !== null && state.look.url === failed ? DEFAULT_BACKGROUND : state.look;
  const idle = state.stage.phase === "idle";

  if (webgl === false) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 bg-black text-center">
        <p className="text-6xl font-extrabold">This display needs hardware graphics</p>
        <p className="text-3xl opacity-80">Open this link in Chrome, with hardware acceleration on.</p>
      </div>
    );
  }
  return (
    <div className={`${gameFont.variable} relative h-full w-full`} style={{ "--brand": state.event.colour } as React.CSSProperties}>
      <Backdrop look={look} onFail={() => setFailed(state.look.url)} />
      {webgl && <Layer3D state={state} offset={offset} synth={synth} theme={look.kind === "theme"} onLost={() => window.location.reload()} />}
      <div className="absolute inset-0"><Screen state={state} offset={offset} synth={synth} /></div>
      {look.kind === "theme" && !idle && state.event.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- an organiser upload; see IdleScreen
        <img src={state.event.logoUrl} alt="" className="absolute bottom-8 right-10 max-h-[70px] max-w-[260px] object-contain opacity-85" />
      )}
    </div>
  );
}

function Screen({ state, offset, synth }: { state: DisplayState; offset: number; synth: Synth }) {
  if (state.race) return <RaceScreen state={state} offset={offset} />;
  if (state.survival) return <SurvivalScreen state={state} offset={offset} />;
  if (state.draw) return <DrawScreen state={state} offset={offset} synth={synth} />;
  return <IdleScreen event={state.event} />;
}
