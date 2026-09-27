"use client";
import { useEffect, useState } from "react";

/**
 * Which step of a timed sequence we are in: 0 until marks[0] ms after mount, then 1 until
 * marks[1], and so on. Three re-renders for a whole reveal, rather than one per frame across
 * 500 tiles. Remount (a new `key`) to replay. `marks` must be a stable, module-level array.
 */
export function useStep(marks: readonly number[]): number {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const ids = marks.map((ms, i) => setTimeout(() => setStep(i + 1), ms));
    return () => ids.forEach(clearTimeout);
  }, [marks]);
  return step;
}
