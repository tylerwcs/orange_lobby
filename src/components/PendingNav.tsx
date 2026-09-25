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

/** How far a finger must travel sideways, in px, before a swipe counts. */
const SWIPE_MIN = 50;

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

/**
 * Swipe left or right across the content to move to the next or previous tab (D234) - the
 * same navigation a tap on the tab makes, so the underline moves and the skeleton shows just
 * as it does for a tap. Touch only: a mouse drag selects text, as it should.
 *
 * A swipe has to be mostly sideways (twice as far across as down) and one finger, so reading
 * down a long day and pinch-zooming a picture never flip the page. Nothing is prevented:
 * vertical scrolling is the browser's, untouched. A touch that starts inside something that
 * scrolls sideways of its own is left to it.
 */
export function PendingSwipe({ prevHref, nextHref, children }: {
  prevHref: string | null;
  nextHref: string | null;
  children: React.ReactNode;
}) {
  const scope = useContext(ScopeContext);
  const router = useRouter();
  // A ref, not state: the finger's start has to be there the instant it lifts, not after a render.
  const start = useRef<{ x: number; y: number } | null>(null);
  const go = (href: string) => (scope ? scope.go(href) : router.push(href, { scroll: false }));
  return (
    <div
      onTouchStart={(e) => {
        const one = e.touches.length === 1 && !inSideScroller(e.target, e.currentTarget);
        start.current = one ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
      }}
      onTouchEnd={(e) => {
        const from = start.current;
        start.current = null;
        if (!from) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - from.x;
        const dy = t.clientY - from.y;
        if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 2) return;
        // Finger moving left brings in what is to the right: the next tab.
        const href = dx < 0 ? nextHref : prevHref;
        if (href) go(href);
      }}
    >
      {children}
    </div>
  );
}
