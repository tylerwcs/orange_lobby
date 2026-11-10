"use client";
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useTransition, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import type { Reveal } from "../../lib/booths";
import { isLanded, liveStart, liveStep, wantsRefresh, type LiveState } from "../../lib/passport-live";
import { markStampsSeenAction } from "../../portal/actions";
import { StampReveal } from "./StampReveal";
import { StampInk } from "./StampDisc";

/** The live queue's state, for the slots: which booths have landed here and are not refreshed yet. */
const Live = createContext<LiveState>(liveStart([]));

/** D870: what the passport book needs from the queue - its state, a way to add reveals, and the poll cursor. */
type LiveControls = {
  state: LiveState;
  arrived: (found: Reveal[]) => void;
  after: RefObject<string | null>;
  /** D880: a stamp the book holds back mid-test still moves the poll on, so it is not found twice. */
  passed: (stampedAt: string) => void;
};
const Controls = createContext<LiveControls | null>(null);

/** The live queue, for the Show my QR dialog and the book. Only inside `PassportLive`. */
export function useLive(): LiveControls {
  const c = useContext(Controls);
  if (!c) throw new Error("useLive outside PassportLive");
  return c;
}

/**
 * D852: the passport page's live part. Holds the queue of stamps still to reveal - the ones not
 * yet seen when the page loaded, then whatever the open QR dialog finds - and plays them one at a
 * time (`passport-live.ts` has the rules). Each one is marked seen as it lands; once the queue is
 * empty the grid is fetched again, and the slots hold the landed stamp until it arrives.
 *
 * D870: the book renders Show my QR itself (`useLive`), in its bar or its corner.
 */
export function PassportLive({ children, slug, token, initial, cursor, brand }: {
  children: ReactNode;
  slug: string;
  token: string;
  initial: Reveal[];
  /** The newest stamp the page was rendered with: the dialog waits for anything after it. */
  cursor: string | null;
  /** The event's colour, for a plain chop revealed on the paper disc (D858). */
  brand: string | null;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(liveStep, initial, liveStart);
  const [refreshing, startRefresh] = useTransition();
  const after = useRef(cursor);
  const asked = useRef(false);

  const arrived = useCallback((found: Reveal[]) => {
    if (found.length === 0) return;
    const last = found[found.length - 1].stampedAt;
    if (after.current === null || Date.parse(last) > Date.parse(after.current)) after.current = last;
    dispatch({ type: "arrived", reveals: found });
  }, []);

  const passed = useCallback((stampedAt: string) => {
    if (after.current === null || Date.parse(stampedAt) > Date.parse(after.current)) after.current = stampedAt;
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
      <Controls.Provider value={{ state, arrived, after, passed }}>
        {children}
        <StampReveal reveal={state.queue[0] ?? null} onDone={done} brand={brand} />
      </Controls.Provider>
    </Live.Provider>
  );
}

/**
 * An unstamped slot's face (D852): its "?" until that booth's reveal lands here, then the stamp,
 * held until the refreshed grid draws the slot from the server - without it the slot would flash
 * back to "?" between the landing and the refresh. It swaps the "?" out rather than covering it:
 * a stamp on the paper has no backing (D856), so the "?" would show through.
 */
export function LandedSlot({ boothId, image, name, deg, empty }: { boothId: string; image: string | null; name: string; deg: number; empty: ReactNode }) {
  const live = useContext(Live);
  if (!isLanded(live, boothId)) return <>{empty}</>;
  return (
    <div className="absolute inset-0 motion-safe:animate-[stamp-settle_0.3s_ease-out]">
      <StampInk image={image} name={name} deg={deg} />
    </div>
  );
}
