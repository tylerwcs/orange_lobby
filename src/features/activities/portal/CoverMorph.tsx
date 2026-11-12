"use client";
import { ViewTransition, useSyncExternalStore } from "react";

const DESKTOP = "(min-width: 48rem)"; // Tailwind's md

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * An activity's picture, named so it grows from its card into the activity page's cover and
 * back (D891). The name has to be unique among what is mounted, and the home page renders its
 * activity cards twice - the phone's swipe row and the desktop's column, one hidden by CSS - so
 * each copy names itself only on the screen size that shows it. `copy="any"` is for a picture
 * rendered once (the Activities page, the activity's own cover).
 *
 * Unnamed on the server and on the first client render; names only matter when a transition
 * starts, by which time the media query has been read.
 *
 * D900: `side` says which end of the morph this is. The card shows a 2:1 crop of the poster and
 * the page shows it whole, so cross-fading the two while both fill the moving box zooms the crop
 * and squashes the poster. Only the whole poster is drawn instead (globals.css), its box growing
 * or shrinking around it - and the browser takes a pair's class from the side arriving, so each
 * side's own class says which snapshot is the whole poster, the phone's back gesture included.
 */
export function CoverMorph({ activityId, copy = "any", side, children }: {
  activityId: string;
  copy?: "phone" | "desktop" | "any";
  side: "card" | "page";
  children: React.ReactNode;
}) {
  const desktop = useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => null);
  const named = desktop !== null && (copy === "any" || (copy === "desktop") === desktop);
  return (
    <ViewTransition name={named ? `activity-cover-${activityId}` : undefined} share={side === "page" ? "pt-morph-to-page" : "pt-morph-to-card"} default="none">
      {children}
    </ViewTransition>
  );
}
