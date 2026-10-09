"use client";
import * as THREE from "three";
import { useEffect, useState } from "react";
import { gameFont } from "../../../font";

/** The display font's CSS family, for canvas text (D293). */
export const GAME_FAMILY = gameFont.style.fontFamily;

/**
 * True once the display font can be drawn onto a canvas: canvas text does not wait for fonts.
 * Initialised from `document.fonts.check` (a synchronous, already-loaded check), not `false`, so
 * a component that remounts after the font has already loaded once — the wheel remounts on every
 * spin start (`key={spin ? s.key : "resting"}`) — is ready on its very first render instead of
 * rendering one flat/blank frame while the (redundant) async load resolves again.
 */
export function useFontReady(): boolean {
  const [ready, setReady] = useState(() => typeof document !== "undefined" && document.fonts.check(`800 64px ${GAME_FAMILY}`));
  useEffect(() => {
    if (ready) return;
    let live = true;
    document.fonts.load(`800 64px ${GAME_FAMILY}`).catch(() => undefined).finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, [ready]);
  return ready;
}

export type Line = { text: string; size: number; colour: string; alpha?: number };

/**
 * A texture of centred lines in the display font, drawn at twice the size so it stays crisp when
 * a card grows. Lines shrink to fit 90% of the width. The caller disposes it when replaced.
 */
export function textTexture(width: number, height: number, lines: Line[], opts: { background?: string; radius?: number; gap?: number } = {}): THREE.CanvasTexture {
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, opts.radius ?? 0);
    ctx.fill();
  }
  const gap = opts.gap ?? 0.25;
  const sizes = lines.map((l) => {
    let s = l.size;
    ctx.font = `800 ${s}px ${GAME_FAMILY}`;
    while (s > 8 && ctx.measureText(l.text).width > width * 0.9) {
      s -= 2;
      ctx.font = `800 ${s}px ${GAME_FAMILY}`;
    }
    return s;
  });
  const total = sizes.reduce((a, s, i) => a + s + (i ? s * gap : 0), 0);
  let y = (height - total) / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  lines.forEach((l, i) => {
    if (i) y += sizes[i] * gap;
    ctx.font = `800 ${sizes[i]}px ${GAME_FAMILY}`;
    ctx.globalAlpha = l.alpha ?? 1;
    ctx.fillStyle = l.colour;
    ctx.fillText(l.text, width / 2, y);
    y += sizes[i];
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
