"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Reveal } from "../../lib/booths";
import { markStampsSeenAction } from "../../portal/actions";
import { PassportQr } from "./PassportQr";
import { StampReveal } from "./StampReveal";
import { StampDisc } from "./StampDisc";

/** Booths whose reveal has landed on this page but whose refreshed grid has not arrived yet. */
const Landed = createContext<ReadonlySet<string>>(new Set());

/**
 * D852: the passport page's live part. Holds the queue of stamps still to reveal - the ones not
 * yet seen when the page loaded, then whatever the open QR dialog finds - and plays them one at a
 * time. Each one is marked seen as it lands; once the queue is empty the grid is fetched again,
 * and `LandedCover` holds the stamp in its slot until it is.
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
  const [queue, setQueue] = useState<Reveal[]>(initial);
  const [landed, setLanded] = useState<ReadonlySet<string>>(new Set());
  const [, startRefresh] = useTransition();
  const after = useRef(cursor);
  const played = useRef(0);

  const arrived = useCallback((found: Reveal[]) => {
    after.current = found[found.length - 1].stampedAt;
    setQueue((q) => [...q, ...found.filter((r) => !q.some((x) => x.stampId === r.stampId))]);
  }, []);

  const done = useCallback((r: Reveal) => {
    setLanded((s) => new Set(s).add(r.boothId));
    played.current += 1;
    // Seen as soon as it has played: a reload mid-queue replays only what was not shown yet.
    void markStampsSeenAction(slug, token, [r.stampId]).catch(() => {});
    setQueue((q) => q.slice(1));
  }, [slug, token]);

  useEffect(() => {
    if (queue.length > 0 || played.current === 0) return;
    played.current = 0;
    startRefresh(() => router.refresh());
  }, [queue.length, router]);

  return (
    <Landed.Provider value={landed}>
      {children}
      {showButton && (
        <PassportQr slug={slug} token={token} activityId={activityId} qr={qr} after={after} paused={queue.length > 0} onArrived={arrived} />
      )}
      <StampReveal reveal={queue[0] ?? null} onDone={done} />
    </Landed.Provider>
  );
}

/**
 * Sits in an unstamped round slot (D852). Shows the stamp once its reveal has landed here, until
 * the refreshed grid draws the slot stamped from the server - without it the slot would flash
 * back to "?" between the landing and the refresh.
 */
export function LandedCover({ boothId, image, name, deg }: { boothId: string; image: string | null; name: string; deg: number }) {
  const landed = useContext(Landed);
  if (!landed.has(boothId)) return null;
  return (
    <div className="absolute inset-[3%] motion-safe:animate-[stamp-settle_0.3s_ease-out]">
      <StampDisc image={image} name={name} deg={deg} />
    </div>
  );
}
