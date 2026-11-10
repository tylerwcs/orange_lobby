"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** A phone's attitude as `deviceorientation` gives it, in degrees. */
export type Attitude = { beta: number; gamma: number };

/** How far the phone turns, in degrees, for the passport's full lean. */
const RANGE = 20;
/** How quickly "level" follows the way the phone is held, per reading (about 60 a second). */
const SETTLE = 0.006;
/** The least change worth a redraw: sensor noise never keeps the passport drawing. */
const STEP = 0.015;

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/**
 * The phone's tilt in the screen's own axes, for any way up the screen is turned: `x` is the
 * right edge tipping away, `y` the top edge tipping away.
 */
export function screenTilt(a: Attitude, screenAngle: number): { x: number; y: number } {
  switch (((screenAngle % 360) + 360) % 360) {
    case 90: return { x: a.beta, y: -a.gamma };
    case 180: return { x: -a.gamma, y: -a.beta };
    case 270: return { x: -a.beta, y: a.gamma };
    default: return { x: a.gamma, y: a.beta };
  }
}

/**
 * The passport's lean (-1..1 each way, as the book's `lean` takes it) from the phone's tilt away
 * from how it is held. The passport keeps still in the room while the phone moves round it: tip
 * the phone's right edge away and the passport's right edge comes towards you.
 */
export function tiltLean(now: { x: number; y: number }, level: { x: number; y: number }): { x: number; y: number } {
  return { x: clamp((level.x - now.x) / RANGE), y: clamp((now.y - level.y) / RANGE) };
}

type OrientationPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * The passport moving with the phone's gyroscope. Android reads it at once; iPhone asks once, on
 * the guest's first tap (`ask`, from a click handler: iOS only asks inside one). "Level" is how the
 * guest holds the phone, and follows slowly as they shift. `on` false (no 3D book, or a page that
 * must keep still) lets the passport settle back flat. `live` is true once a reading has come in,
 * so a finger's lean steps aside.
 */
export function useDeviceTilt(lean: (x: number, y: number) => void, on: boolean): { ask: () => void; live: () => boolean } {
  const needsAsk = typeof window !== "undefined" && typeof (window.DeviceOrientationEvent as unknown as OrientationPermission | undefined)?.requestPermission === "function";
  const [allowed, setAllowed] = useState(!needsAsk);
  const asked = useRef(false);
  const live = useRef(false);
  const leanRef = useRef(lean);
  useEffect(() => { leanRef.current = lean; }, [lean]);

  const ask = useCallback(() => {
    if (!needsAsk || asked.current) return;
    asked.current = true;
    (window.DeviceOrientationEvent as unknown as OrientationPermission).requestPermission!()
      .then((r) => { if (r === "granted") setAllowed(true); })
      .catch(() => {});
  }, [needsAsk]);

  useEffect(() => {
    if (!on || !allowed || typeof window === "undefined") return;
    let level: { x: number; y: number } | null = null;
    let last = { x: 0, y: 0 };
    const read = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      const now = screenTilt({ beta: e.beta, gamma: e.gamma }, screen.orientation?.angle ?? 0);
      if (!level) level = now;
      level = { x: level.x + (now.x - level.x) * SETTLE, y: level.y + (now.y - level.y) * SETTLE };
      live.current = true;
      const l = tiltLean(now, level);
      if (Math.abs(l.x - last.x) < STEP && Math.abs(l.y - last.y) < STEP) return;
      last = l;
      leanRef.current(l.x, l.y);
    };
    window.addEventListener("deviceorientation", read);
    return () => {
      window.removeEventListener("deviceorientation", read);
      live.current = false;
      leanRef.current(0, 0);
    };
  }, [on, allowed]);

  return { ask, live: useCallback(() => live.current, []) };
}
