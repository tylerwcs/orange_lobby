"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { backoff, clockOffset } from "@/lib/games/poll";

type Polled = { now: number; key?: string; unchanged?: true };

/**
 * Polls a game endpoint (D256). `versioned` sends the last key so the server can answer
 * "unchanged" (phones); the LED and host take the full view every time (D260). Keeps the
 * server-clock offset (D257) and backs off after failures (D262). `apply` takes a response got
 * elsewhere (a join); `pollNow` polls at once (after a host action).
 *
 * Every tick carries a generation number and only the newest reschedules, so a pollNow during
 * a tick in flight cannot leave two timers running. Only the newest tick applies its answer
 * too, and only if nothing was applied since it was sent (a pollNow's answer, or a join's), so
 * an old response landing late cannot roll the view back. `intervalFor` must be a module-level
 * (stable) function, or every render restarts the polling.
 */
export function usePoll<T extends Polled>(url: string, initial: T, intervalFor: (s: T) => number, versioned: boolean) {
  const [state, setState] = useState<T>(initial);
  const [offset, setOffset] = useState(0);
  const latest = useRef(initial);
  const failures = useRef(0);
  const generation = useRef(0);
  const applied = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<() => void>(() => {});

  const apply = useCallback((next: T) => {
    if (next.unchanged) return;
    applied.current += 1;
    latest.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const gen = ++generation.current;
      if (timer.current) clearTimeout(timer.current);
      const sent = Date.now();
      const seen = applied.current;
      try {
        const key = versioned ? latest.current.key : undefined;
        const res = await fetch(key ? `${url}?v=${encodeURIComponent(key)}` : url, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as T;
        if (stopped) return;
        failures.current = 0;
        if (gen === generation.current && applied.current === seen) {
          setOffset(clockOffset(sent, Date.now(), body.now));
          apply(body);
        }
      } catch {
        failures.current += 1;
      }
      if (stopped || gen !== generation.current) return;
      timer.current = setTimeout(tick, failures.current ? backoff(failures.current) : intervalFor(latest.current));
    };
    tickRef.current = () => { void tick(); };
    timer.current = setTimeout(tick, intervalFor(latest.current));
    return () => {
      stopped = true;
      tickRef.current = () => {};
      if (timer.current) clearTimeout(timer.current);
    };
  }, [url, versioned, intervalFor, apply]);

  const pollNow = useCallback(() => tickRef.current(), []);
  return { state, offset, apply, pollNow };
}

/**
 * Server time (D257), ticking every `everyMs` while `active`. The offset is read through a ref
 * so a fresh offset on every poll does not restart the ticker (with `everyMs` at or above the
 * poll interval it would otherwise never tick). Becoming active ticks at once, so a countdown
 * never starts from a stale time.
 */
export function useServerNow(offset: number, everyMs = 200, active = true): number {
  const [now, setNow] = useState(() => Date.now() + offset);
  const offsetRef = useRef(offset);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now() + offsetRef.current);
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, everyMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [everyMs, active]);
  return now;
}
