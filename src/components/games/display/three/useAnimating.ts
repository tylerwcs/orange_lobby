"use client";
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

/** Keeps the demand-rendered canvas drawing at `fps` while `active` (D294); idle otherwise. */
export function useAnimating(active: boolean, fps = 60) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!active) return;
    if (fps >= 60) {
      let raf = 0;
      const loop = () => { invalidate(); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }
    const id = setInterval(() => invalidate(), 1000 / fps);
    return () => clearInterval(id);
  }, [active, fps, invalidate]);
}
