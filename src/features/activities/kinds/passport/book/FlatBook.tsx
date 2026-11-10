"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { paintPage, type PageData, type PageKey } from "./pages";

type Img = (url: string | null) => HTMLImageElement | null;

/**
 * D889: the passport for phones without WebGL, and the 2D half of every page. The same pages as
 * the 3D book, painted by the same code, shown a spread at a time - the top page above the bottom
 * one, or the cover alone while closed - with a short crossfade for each turn (none with reduced
 * motion). Taps land as page coordinates (`u` across, `v` up, as a raycast gives them).
 */
export function FlatBook({ spread, data, img, repaint, onTop, onBottom, overlay, topOverlay, press = 0 }: {
  spread: { top: PageKey | null; bottom: PageKey };
  data: PageData;
  img: Img;
  /** Changes whenever an image or a font lands, so the pages repaint. */
  repaint: number;
  onTop: () => void;
  onBottom: (u: number, v: number) => void;
  /** Laid over the bottom page in page percentages: the name field (D874). */
  overlay?: ReactNode;
  /** Laid over the top page: the slot a revealed stamp flies to (D878). */
  topOverlay?: ReactNode;
  /** Goes up each time a stamp is pressed in: the book gives a small press. */
  press?: number;
}) {
  const key = `${spread.top ?? ""}|${spread.bottom}`;
  if (!spread.top) {
    return (
      <div key={key} className="motion-safe:animate-[book-fade_250ms_ease-out]">
        <Page pageKey={spread.bottom} data={data} img={img} repaint={repaint} onTap={onBottom}
          className="h-[min(68dvh,calc((100vw-48px)*1.4222))] w-auto rounded-r-[14px] rounded-l-[6px] shadow-[0_24px_48px_rgba(0,0,0,.45)]" />
      </div>
    );
  }
  return (
    <div key={key} className="flex w-[min(560px,100%,calc((100dvh-200px)*0.7111))] flex-col motion-safe:animate-[book-fade_250ms_ease-out] shadow-[0_24px_48px_rgba(0,0,0,.45)]">
      <div key={`press-${press}`} className={press ? "relative motion-safe:animate-[book-press_280ms_ease-out]" : "relative"}>
        <Page pageKey={spread.top} data={data} img={img} repaint={repaint} onTap={() => onTop()} className="w-full rounded-t-[10px]" />
        {topOverlay}
      </div>
      <div className="relative @container">
        <Page pageKey={spread.bottom} data={data} img={img} repaint={repaint} onTap={onBottom} className="w-full rounded-b-[10px]" />
        {overlay}
      </div>
    </div>
  );
}

function Page({ pageKey, data, img, repaint, onTap, className }: {
  pageKey: PageKey; data: PageData; img: Img; repaint: number; onTap: (u: number, v: number) => void; className: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (ref.current) paintPage(pageKey, ref.current, data, img);
  }, [pageKey, data, img, repaint]);
  return (
    <canvas
      ref={ref} aria-hidden className={`block cursor-pointer select-none ${className}`}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onTap((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
      }}
    />
  );
}
