"use client";
import { useEffect } from "react";
import { recordVisitAction } from "./actions";

/**
 * D899: counts one visit from a tracked link, once per tab. Sent from the browser rather than the
 * page render, so link previews, prefetches and refreshes are not counted. The marker lives in
 * sessionStorage, not a cookie, and goes when the tab closes.
 */
export function VisitBeacon({ slug, source }: { slug: string; source: string }) {
  useEffect(() => {
    const key = `ecp-visit:${slug}:${source}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage blocked (private mode on some browsers): count it anyway.
    }
    void recordVisitAction(slug, source);
  }, [slug, source]);
  return null;
}
