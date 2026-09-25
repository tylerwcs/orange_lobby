"use client";

import { createContext, useContext, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";

/**
 * Feedback for navigations that `loading.tsx` cannot see.
 *
 * Next swaps in a route's skeleton when a link leads to a different page. A link that only
 * changes the query string - a day tab, Next page, a checkpoint - stays on the same page, so
 * no boundary fires and the old content just sits there until the new render lands. On a
 * phone that reads as a tap that did not register.
 *
 * A `PendingScope` runs those navigations as a transition it can see. Inside it,
 * `PendingLink` starts one and moves its own "selected" look at once; `PendingSwap` puts up
 * a skeleton in place of the content while it runs. Anything outside the swap - the tabs
 * themselves - stays put, so the reader sees which tab they chose while it loads.
 *
 * The links are still real `<a href>`s: a modified click (new tab, new window) and a page
 * without JavaScript both fall through to the browser as ordinary links.
 */
type Scope = { go: (href: string) => void; pending: boolean; target: string | null };

const ScopeContext = createContext<Scope | null>(null);

export function PendingScope({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<string | null>(null);
  const go = (href: string) => {
    setTarget(href);
    start(() => router.push(href, { scroll: false }));
  };
  return <ScopeContext.Provider value={{ go, pending, target }}>{children}</ScopeContext.Provider>;
}

/** The content a scoped navigation replaces. Outside a scope it is only its children. */
export function PendingSwap({ fallback, children }: { fallback: React.ReactNode; children: React.ReactNode }) {
  const scope = useContext(ScopeContext);
  return <>{scope?.pending ? fallback : children}</>;
}

const modified = (e: React.MouseEvent) => e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;

/**
 * A link that shows it was pressed.
 *
 * Inside a `PendingScope` it drives that scope. Outside one it runs its own transition and
 * shows a spinner at its leading edge instead - for a lone control such as the booths' QR
 * button, where there is no region to swap but the press still has to answer.
 *
 * `selected` and the two class names are for tabs: while a navigation is on its way, the link
 * being navigated to looks selected and its siblings do not, ahead of the server's answer.
 */
export function PendingLink({ href, className = "", selected, selectedClassName = "", unselectedClassName = "", children, ...rest }: {
  href: string;
  className?: string;
  selected?: boolean;
  selectedClassName?: string;
  unselectedClassName?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children" | "onClick">) {
  const scope = useContext(ScopeContext);
  const router = useRouter();
  const [ownPending, start] = useTransition();
  const pending = scope ? scope.pending && scope.target === href : ownPending;
  const looksSelected = scope?.pending ? scope.target === href : selected;
  return (
    <Link
      href={href}
      {...rest}
      aria-busy={pending || undefined}
      aria-current={selected !== undefined && looksSelected ? "page" : undefined}
      className={`${className} ${looksSelected ? selectedClassName : unselectedClassName}`}
      onClick={(e) => {
        if (modified(e)) return;
        e.preventDefault();
        if (scope) scope.go(href);
        else start(() => router.push(href, { scroll: false }));
      }}
    >
      {!scope && ownPending && <Spinner data-icon="inline-start" />}
      {children}
    </Link>
  );
}

/** How far a finger must travel sideways, in px, before a slow drag commits. */
const SWIPE_MIN = 50;
/** A flick faster than this (px per ms) commits however short it was. */
const FLICK = 0.5;
/** How far a finger moves before we decide whether this gesture is sideways or a scroll. */
const AXIS_LOCK = 8;
const OUT_MS = 180;
const IN_MS = 240;

/**
 * Whether a touch began inside something that scrolls sideways of its own - a wide table in
 * an info tab, say - between the touched element and the swipe area. That swipe belongs to it.
 */
function inSideScroller(from: EventTarget | null, area: HTMLElement): boolean {
  for (let el = from instanceof HTMLElement ? from : null; el && el !== area; el = el.parentElement) {
    const x = getComputedStyle(el).overflowX;
    if ((x === "auto" || x === "scroll") && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Swipe left or right across the content to move to the next or previous tab (D234, D235) -
 * the same navigation a tap on the tab makes, so the underline moves and the skeleton shows
 * just as they do for a tap.
 *
 * The content follows the finger. The first few pixels decide the gesture: mostly sideways
 * and it is a swipe, otherwise it is a scroll and this stays out of the way for the rest of
 * it. Past a quarter of the width, or on a quick flick, the content slides off and the next
 * tab slides in from the other side; short of that it springs back. With nothing on that side
 * (the first or last tab) it drags with resistance and always springs back. Touch only; a
 * touch that starts inside something that scrolls sideways of its own is left to it; with
 * reduced motion the switch is instant.
 *
 * The transform is written straight to the element rather than through React state: it
 * changes on every touchmove, and a re-render per frame would make the drag lag the finger.
 */
export function PendingSwipe({ prevHref, nextHref, className = "", paneClassName = "", children }: {
  prevHref: string | null;
  nextHref: string | null;
  /** On the swipe area - where touches are caught. */
  className?: string;
  /** On the moving pane that holds the content - its layout, e.g. the gap between rows. */
  paneClassName?: string;
  children: React.ReactNode;
}) {
  const scope = useContext(ScopeContext);
  const router = useRouter();
  const pane = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; t: number; axis: "x" | "y" | null; dx: number } | null>(null);
  const go = (href: string) => (scope ? scope.go(href) : router.push(href, { scroll: false }));

  const move = (x: number, ms = 0) => {
    const el = pane.current;
    if (!el) return;
    el.style.transition = ms ? `transform ${ms}ms cubic-bezier(.2,.8,.2,1)` : "none";
    el.style.transform = x ? `translate3d(${x}px,0,0)` : "";
  };

  return (
    // overflow-x clip, not hidden: the content can leave sideways without this becoming a
    // scroll container of its own.
    <div
      className={`overflow-x-clip ${className}`}
      onTouchStart={(e) => {
        const ok = e.touches.length === 1 && !inSideScroller(e.target, e.currentTarget);
        drag.current = ok ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), axis: null, dx: 0 } : null;
      }}
      onTouchMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.touches[0].clientX - d.x;
        const dy = e.touches[0].clientY - d.y;
        if (!d.axis) {
          if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return;
          d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        }
        if (d.axis !== "x") return;
        // Nothing on that side: drag against resistance, so it still answers the finger.
        const open = dx < 0 ? nextHref : prevHref;
        d.dx = open ? dx : dx / 3;
        if (!reducedMotion()) move(d.dx);
      }}
      onTouchEnd={() => {
        const d = drag.current;
        drag.current = null;
        if (!d || d.axis !== "x") return;
        const width = pane.current?.offsetWidth ?? 320;
        const href = d.dx < 0 ? nextHref : prevHref;
        const flick = Math.abs(d.dx) / Math.max(1, Date.now() - d.t) > FLICK && Math.abs(d.dx) > 20;
        if (!href || (Math.abs(d.dx) < Math.max(SWIPE_MIN, width / 4) && !flick)) {
          move(0, 200);
          return;
        }
        if (reducedMotion()) { move(0); go(href); return; }
        // Off the way the finger went, then the next tab in from the other side.
        const dir = d.dx < 0 ? -1 : 1;
        move(dir * width, OUT_MS);
        window.setTimeout(() => {
          go(href);
          move(-dir * width);
          requestAnimationFrame(() => requestAnimationFrame(() => move(0, IN_MS)));
        }, OUT_MS);
      }}
      onTouchCancel={() => {
        drag.current = null;
        move(0, 200);
      }}
    >
      <div ref={pane} className={`will-change-transform ${paneClassName}`}>{children}</div>
    </div>
  );
}
