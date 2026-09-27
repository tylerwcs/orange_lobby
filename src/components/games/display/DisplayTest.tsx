"use client";
import { useEffect, useMemo, useState } from "react";
import type { DisplayState } from "@/lib/games/wire";
import { testStep } from "@/lib/games/display-test";
import { DisplayShell } from "./DisplayClient";

/** /display/[token]?test (D296): the LED page on built-in data, looping, with no polling. */
export function DisplayTest({ event }: { event: DisplayState["event"] }) {
  const [step, setStep] = useState(0);
  const [at, setAt] = useState(() => Date.now());
  const { state, holdMs } = useMemo(() => testStep(step, event, at), [step, event, at]);
  useEffect(() => {
    const id = setTimeout(() => { setStep((s) => s + 1); setAt(Date.now()); }, holdMs);
    return () => clearTimeout(id);
  }, [step, holdMs]);
  return <DisplayShell state={state} offset={0} />;
}
