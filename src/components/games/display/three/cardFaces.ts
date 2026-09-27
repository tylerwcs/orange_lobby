"use client";
import * as THREE from "three";
import { CARD_BADGE, CARD_CORNER, CARD_PHOTO_SHARE, cardUv, containRect, coverCrop, fitText, type FitOptions } from "@/lib/games/card-face";
import { GAME_FAMILY } from "./textTexture";

/** How thick a card is, in LED pixels: just enough of an edge to read as a card mid-flip. */
export const CARD_DEPTH = 6;

const INK = "#111827";

/** A `w`×`h` rectangle with rounded corners (radius CARD_CORNER of the width), centred on the origin. */
function cardShape(w: number, h: number): THREE.Shape {
  const r = w * CARD_CORNER;
  const x0 = -w / 2;
  const y0 = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + w - r, y0);
  s.absarc(x0 + w - r, y0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x0 + w, y0 + h - r);
  s.absarc(x0 + w - r, y0 + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, y0 + h);
  s.absarc(x0 + r, y0 + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + r);
  s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

export type CardGeometries = { face: THREE.ShapeGeometry; edge: THREE.ExtrudeGeometry };

/**
 * The rounded card's pieces (polish D323), shared by every card of one size: `face` — one flat
 * rounded face, its UVs spread 0–1 over the whole card so a full-rectangle texture maps straight
 * on and the rounded corners are simply not there (the old box drew the texture's transparent
 * corners as black) — used twice, back to back; and `edge` — the thin rounded rim between them,
 * the sides of an extrusion only (its caps would sit exactly on the faces and z-fight). The
 * caller disposes both.
 */
export function cardGeometries(w: number, h: number): CardGeometries {
  const shape = cardShape(w, h);
  const face = new THREE.ShapeGeometry(shape, 12);
  const pos = face.attributes.position;
  const uv = face.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = cardUv(pos.getX(i), pos.getY(i), w, h);
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  const edge = new THREE.ExtrudeGeometry(shape, { depth: CARD_DEPTH, bevelEnabled: false, curveSegments: 12 });
  edge.translate(0, 0, -CARD_DEPTH / 2);
  // ExtrudeGeometry's groups: 0 = both caps, 1 = the sides. Draw only the sides.
  const sides = edge.groups.find((g) => g.materialIndex === 1);
  if (sides) {
    edge.clearGroups();
    edge.setDrawRange(sides.start, sides.count);
  }
  return { face, edge };
}

/** A canvas drawn at `scale`× the card's size, so it stays crisp as the card grows on the reveal. */
function canvasFor(w: number, h: number, scale: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(canvas.width / w, canvas.height / h);
  return { canvas, ctx };
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * False if drawing a picture tainted the canvas (served without CORS after all, e.g. from a cache
 * entry made without it): WebGL would then throw on upload, mid-frame. The caller draws the
 * no-image version instead.
 */
function readable(ctx: CanvasRenderingContext2D): boolean {
  try {
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

const font = (size: number) => `800 ${size}px ${GAME_FAMILY}`;

/** Draws `text` fitted into `box` (centred lines, near-black by default), per fitText. */
function drawText(ctx: CanvasRenderingContext2D, text: string, box: { x: number; y: number; w: number; h: number }, opts: Omit<FitOptions, "maxW" | "maxH">, colour: string) {
  const measure = (s: string, size: number) => {
    ctx.font = font(size);
    return ctx.measureText(s).width;
  };
  const lh = opts.lineHeight ?? 1.1;
  const { lines, size } = fitText(text, measure, { ...opts, maxW: box.w, maxH: box.h, lineHeight: lh });
  if (!lines.length) return;
  ctx.font = font(size);
  ctx.fillStyle = colour;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const step = size * lh;
  const total = lines.length * step - (lh - 1) * size;
  let top = box.y + (box.h - total) / 2;
  for (const line of lines) {
    // Centre on the glyphs actually drawn (digits have no descender), not the font's em box.
    const m = ctx.measureText(line);
    const ascent = m.actualBoundingBoxAscent || size * 0.75;
    const descent = m.actualBoundingBoxDescent || 0;
    const baseline = top + size / 2 + (ascent - descent) / 2;
    ctx.fillText(line, box.x + box.w / 2, baseline, box.w);
    top += step;
  }
}

/**
 * The side of a card the room sees in the grid (D317, polish D323). With the game's card back
 * picture (`img`): the picture cover-cropped over the whole card and the number in a white badge
 * in the middle, big enough to read from the back of the room. Without one (none set, still
 * loading, or failed): the event colour with a big white number, as before.
 */
export function cardBackTexture(w: number, h: number, no: number, colour: string, img: HTMLImageElement | null | undefined): THREE.CanvasTexture {
  if (img) {
    const { canvas, ctx } = canvasFor(w, h, 2);
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, w, h);
    const c = coverCrop(img.naturalWidth, img.naturalHeight, w, h);
    ctx.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, w, h);
    if (readable(ctx)) {
      const d = w * CARD_BADGE;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = d * 0.18;
      ctx.shadowOffsetY = d * 0.05;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, d / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const inner = d * 0.72;
      drawText(ctx, String(no), { x: w / 2 - inner / 2, y: h / 2 - inner / 2, w: inner, h: inner }, { maxLines: 1, start: d * 0.62 }, INK);
      return toTexture(canvas);
    }
  }
  const { canvas, ctx } = canvasFor(w, h, 2);
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, w, h);
  drawText(ctx, String(no), { x: w * 0.05, y: 0, w: w * 0.9, h }, { maxLines: 1, start: h * 0.42 }, "#ffffff");
  return toTexture(canvas);
}

/**
 * A taken card's other side, shown by the flip (D317, polish D323) — just the prize, no "you
 * win". With its picture (`img`): the whole picture on white in the top CARD_PHOTO_SHARE, and the
 * prize name in a light bar along the bottom. Without one: the name alone, large, on white. Drawn
 * sharper than the backs: this is the side the card shows at its biggest, after growing.
 */
export function prizeFaceTexture(w: number, h: number, prize: string, img: HTMLImageElement | null | undefined): THREE.CanvasTexture {
  const scale = Math.max(2, 720 / h);
  if (img) {
    const { canvas, ctx } = canvasFor(w, h, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    const photoH = h * CARD_PHOTO_SHARE;
    // Inset by the corner radius, so the rounded corners never clip the picture.
    const pad = w * CARD_CORNER;
    const at = containRect(img.naturalWidth, img.naturalHeight, { x: pad, y: pad, w: w - pad * 2, h: photoH - pad * 1.5 });
    ctx.drawImage(img, at.x, at.y, at.w, at.h);
    if (readable(ctx)) {
      const barH = h - photoH;
      ctx.fillStyle = "#f1f2f4";
      ctx.fillRect(0, photoH, w, barH);
      ctx.fillStyle = "#e2e4e8";
      ctx.fillRect(0, photoH, w, Math.max(1, h * 0.004));
      drawText(ctx, prize, { x: w * 0.07, y: photoH + barH * 0.1, w: w * 0.86, h: barH * 0.8 }, { maxLines: 2, start: barH * 0.46 }, INK);
      return toTexture(canvas);
    }
  }
  const { canvas, ctx } = canvasFor(w, h, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  drawText(ctx, prize, { x: w * 0.08, y: h * 0.1, w: w * 0.84, h: h * 0.8 }, { maxLines: 3, start: h * 0.17 }, INK);
  return toTexture(canvas);
}
