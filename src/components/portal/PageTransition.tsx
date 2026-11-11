"use client";
import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

/** Transition types the portal's links tag a navigation with (D891). */
export const TO_ACTIVITY = ["portal-to-activity"];
export const GOING_BACK = ["portal-back"];

/**
 * How one personal-portal page hands over to the next (D891): the old page fades out quickly,
 * the new one rises in a little more gently. A way back (the "‹ Home" bar, "← Activities")
 * sinks in instead, so it reads as returning. Opening an activity from its card runs the same
 * hand-over a beat later, under the card's picture growing into the page's (`CoverMorph`).
 *
 * Keyed by the path, so a new page is an exit and an enter; a refresh, a server action or a
 * search-param tab on the same page is an update, and `default="none"` leaves those still.
 * The header is outside this, in the layout, so it stays put as the anchor.
 *
 * There is no loading.tsx inside the token's pages any more: a page that suspended into a
 * skeleton would show grey on every tap and would stop the morph from pairing. The page stays
 * up, the tapped link looks pressed and the bar runs along the top (`LinkPending`) until the
 * next one is ready. The CSS is in globals.css under "Page transitions".
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition
      key={pathname}
      enter={{ "portal-to-activity": "pt-in-late", "portal-back": "pt-back", default: "pt-in" }}
      exit={{ default: "pt-out" }}
      default="none"
    >
      <div>{children}</div>
    </ViewTransition>
  );
}
