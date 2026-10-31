"use client";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { Group } from "three";
import type { GameEvent } from "../../game/engine";
import type { Quality } from "../../game/quality";
import { createSlimeState, disposeSlimeState, step, type Head, type SceneFrame, type SlimeState } from "./slimeFx";

/**
 * The slimes (D793): round glossy jelly blobs with big eyes, hopping with squash and stretch, and
 * what happens to them: a bubble shot and a squish, a burst of droplets and a fading puddle on a
 * pop; a swell and a warning pulse while stuck; goo flying at the screen when one explodes.
 *
 * Everything here is imperative three.js driven by `update` from the scene's one frame loop: the
 * slimes come and go every few hundred ms, and none of it may cost a React render. The Game is
 * only read; hops, sizes and wobbles are visual, from time and the slime's id.
 */

export type SlimesApi = {
  update(f: SceneFrame, events: readonly GameEvent[]): void;
  heads(): ReadonlyMap<number, Head>;
};

export function Slimes({ quality, ref }: { quality: Quality; ref?: Ref<SlimesApi> }) {
  const group = useRef<Group>(null);
  const state = useRef<SlimeState | null>(null);

  // The kit and every live object belong to one quality; a change starts them afresh.
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const st = createSlimeState(g, quality);
    state.current = st;
    return () => {
      disposeSlimeState(st);
      if (state.current === st) state.current = null;
    };
  }, [quality]);

  useImperativeHandle(ref, () => ({
    update(f, events) {
      const st = state.current;
      if (st) step(st, f, events);
    },
    heads() {
      return state.current?.heads ?? new Map();
    },
  }), []);

  return <group ref={group} />;
}
