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
 */
export function CoverMorph({ activityId, copy = "any", children }: {
  activityId: string;
  copy?: "phone" | "desktop" | "any";
  children: React.ReactNode;
}) {
  const desktop = useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => null);
  const named = desktop !== null && (copy === "any" || (copy === "desktop") === desktop);
  return (
    <ViewTransition name={named ? `activity-cover-${activityId}` : undefined} share="pt-morph" default="none">
      {children}
    </ViewTransition>
  );
}
