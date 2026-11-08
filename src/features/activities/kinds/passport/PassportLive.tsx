"use client";
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Reveal } from "../../lib/booths";
import { isLanded, liveStart, liveStep, wantsRefresh, type LiveState } from "../../lib/passport-live";
import { markStampsSeenAction } from "../../portal/actions";
import { PassportQr } from "./PassportQr";
import { StampReveal } from "./StampReveal";
import { StampDisc, StampGlyph } from "./StampDisc";

/** The live queue's state, for the slots: which booths have landed here and are not refreshed yet. */
const Live = createContext<LiveState>(liveStart([]));

/**
 * D852: the passport page's live part. Holds the queue of stamps still to reveal - the ones not
 * yet seen when the page loaded, then whatever the open QR dialog finds - and plays them one at a
 * time (`passport-live.ts` has the rules). Each one is marked seen as it lands; once the queue is
 * empty the grid is fetched again, and the slots hold the landed stamp until it arrives.
 */
export function PassportLive({ children, slug, token, activityId, qr, initial, cursor, showButton }: {
  children: ReactNode;
  slug: string;
  token: string;
  activityId: string;
  /** The attendee's QR as a data URL, made on the server like the badge's. */
  qr: string;
  initial: Reveal[];
  /** The newest stamp the page was rendered with: the dialog waits for anything after it. */
  cursor: string | null;
  showButton: boolean;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(liveStep, initial, liveStart);
  const [refreshing, startRefresh] = useTransition();
  const after = useRef(cursor);
  const asked = useRef(false);

  const arrived = useCallback((found: Reveal[]) => {
    after.current = found[found.length - 1].stampedAt;
    dispatch({ type: "arrived", reveals: found });
  }, []);

  const done = useCallback((r: Reveal) => {
    dispatch({ type: "landed", reveal: r });
    // Seen as soon as it has played: a reload mid-queue replays only what was not shown yet.
    void markStampsSeenAction(slug, token, [r.stampId]).catch(() => {});
  }, [slug, token]);

  const refresh = wantsRefresh(state);
  useEffect(() => {
    if (!refresh) return;
    dispatch({ type: "refreshing" });
    asked.current = true;
    startRefresh(() => router.refresh());
  }, [refresh, router]);

  // The transition settles once the refreshed tree has committed: from then on the server's grid
  // is the truth, so the holds it covers are let go.
  useEffect(() => {
    if (refreshing || !asked.current) return;
    asked.current = false;
    dispatch({ type: "refreshed" });
  }, [refreshing]);

  return (
    <Live.Provider value={state}>
      {children}
      {showButton && (
        <PassportQr slug={slug} token={token} activityId={activityId} qr={qr} after={after} paused={state.queue.length > 0} onArrived={arrived} />
      )}
      <StampReveal reveal={state.queue[0] ?? null} onDone={done} />
    </Live.Provider>
  );
}

/**
 * Sits in an unstamped round slot (D852). Shows the stamp once its reveal has landed here, until
 * the refreshed grid draws the slot from the server - without it the slot would flash back to "?"
 * between the landing and the refresh.
 */
export function LandedCover({ boothId, image, name, deg }: { boothId: string; image: string | null; name: string; deg: number }) {
  const live = useContext(Live);
  if (!isLanded(live, boothId)) return null;
  return (
    <div className="absolute inset-[3%] motion-safe:animate-[stamp-settle_0.3s_ease-out]">
      <StampDisc image={image} name={name} deg={deg} />
    </div>
  );
}

/** The same hold for a box cell, a passport with no artwork: the chop in place of the empty ring. */
export function LandedGlyph({ boothId, deg, empty }: { boothId: string; deg: number; empty: ReactNode }) {
  const live = useContext(Live);
  if (!isLanded(live, boothId)) return <>{empty}</>;
  return <span className="motion-safe:animate-[stamp-settle_0.3s_ease-out]"><StampGlyph deg={deg} /></span>;
}
