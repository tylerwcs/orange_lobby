"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PassportTest, Personality } from "@/features/passport-test/client";
import { COVER_SIZE, paintCover, paintHolder, paintName, paintQuestion, paintScene, paintSign, paintStamps, type Fonts } from "./paint";
import { PAGE } from "./geometry";
import type { BookFlow } from "./flow";

/**
 * Every page of the passport by name. The flat book shows two at a time; the 3D book (D870) holds
 * them all as textures. Both paint through `paintPage`, so they never differ.
 */
export type PageKey = "cover" | `scene:${number}` | `question:${number}` | "sign" | "name" | "holder" | "stamps";

export type BookStamp = { id: string; image: string | null; name: string };

/** Everything a page is painted from. */
export type PageData = {
  test: PassportTest;
  eventName: string;
  coverColour: string;
  crest: string | null;
  flow: BookFlow;
  holderName: string;
  personality: Personality | null;
  revealProgress: number;
  stamps: BookStamp[];
  seed: string;
  chop: { ring: string; check: string };
  fonts: Fonts;
  /** Whether the name is painted on the name page (false while the DOM field sits over it). */
  paintName: boolean;
};

export function pageSize(key: PageKey): { w: number; h: number } {
  return key === "cover" ? COVER_SIZE : PAGE;
}

/** The two pages on show, top then bottom; the closed passport is the cover alone (D871). */
export function spreadFor(flow: BookFlow): { top: PageKey | null; bottom: PageKey } {
  switch (flow.stage) {
    case "locked":
    case "closed":
      return { top: null, bottom: "cover" };
    case "questions":
      return { top: `scene:${flow.index}`, bottom: `question:${flow.index}` };
    case "name":
      return { top: "sign", bottom: "name" };
    default:
      return { top: "stamps", bottom: "holder" };
  }
}

/** Paints one page onto its canvas. `img` returns a loaded image for a URL, or null while it loads. */
export function paintPage(key: PageKey, canvas: HTMLCanvasElement, d: PageData, img: (url: string | null) => HTMLImageElement | null) {
  const { w, h } = pageSize(key);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.filter = "none";
  const [kind, n] = key.split(":") as [string, string | undefined];
  const i = Number(n);
  const fonts = d.fonts;
  switch (kind) {
    case "cover":
      return paintCover(ctx, { colour: d.coverColour, crest: img(d.crest), eventName: d.eventName, fonts });
    case "scene":
      return paintScene(ctx, { q: d.test.questions[i], index: i, img: img(d.test.questions[i]?.image ?? null), fonts });
    case "question":
      return paintQuestion(ctx, { q: d.test.questions[i], index: i, total: d.test.questions.length, picked: d.flow.picks[i] ?? null, fonts });
    case "sign":
      return paintSign(ctx, { fonts });
    case "name":
      return paintName(ctx, { name: d.holderName, fonts, showName: d.paintName });
    case "holder":
      return paintHolder(ctx, {
        test: d.personality ? d.test : null, personality: d.personality, holderName: d.holderName,
        picture: img(d.personality?.picture ?? null), progress: d.revealProgress, eventName: d.eventName, fonts,
      });
    case "stamps":
      return paintStamps(ctx, { seed: d.seed, chop: d.chop, fonts, stamps: d.stamps.map((s) => ({ name: s.name, image: img(s.image) })) });
  }
}

/**
 * Images the pages draw, loaded once each. `version` goes up whenever one finishes (or fails),
 * so the pages repaint; a failed one stays null and the page shows its fallback (D873).
 * `prefetch` starts loads ahead of need (the next questions' pictures, D889).
 */
export function useImages() {
  const cache = useRef(new Map<string, HTMLImageElement>());
  const [version, setVersion] = useState(0);
  const load = useCallback((url: string) => {
    let im = cache.current.get(url);
    if (!im) {
      im = new Image();
      im.crossOrigin = "anonymous";
      im.decoding = "async";
      const done = () => setVersion((v) => v + 1);
      im.onload = done; im.onerror = done;
      im.src = url;
      cache.current.set(url, im);
    }
    return im;
  }, []);
  const img = useCallback((url: string | null) => {
    if (!url) return null;
    const im = load(url);
    return im.complete && im.naturalWidth > 0 ? im : null;
  }, [load]);
  const prefetch = useCallback((urls: (string | null | undefined)[]) => { for (const u of urls) if (u) load(u); }, [load]);
  return { img, prefetch, version };
}

/** Repaints once the web fonts land, for pages painted with the fallbacks first. */
export function useFontsVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const bump = () => setV((x) => x + 1);
    document.fonts.addEventListener("loadingdone", bump);
    void document.fonts.ready.then(bump);
    return () => document.fonts.removeEventListener("loadingdone", bump);
  }, []);
  return v;
}
