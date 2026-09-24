"use client";

import { Children, useEffect, useRef, useState } from "react";

/**
 * A row that shows one item at a time, full width, and swipes to the next (D219). Nothing
 * peeks in from the edge; the dots under it say how many there are and which one is showing,
 * and tapping a dot scrolls to it. With one item there is nothing to swipe and no dots.
 */
export function SwipeRow({ label, stackOnDesktop = false, children }: {
  label: string;
  /** From md, drop the swipe and list every item one under another, with no dots (D223). */
  stackOnDesktop?: boolean;
  children: React.ReactNode;
}) {
  const items = Children.toArray(children);
  const row = useRef<HTMLUListElement>(null);
  const [at, setAt] = useState(0);

  // Which item is showing, from what is actually in view rather than from scroll events:
  // those are not guaranteed to arrive for the last step of a snap or a smooth scroll.
  useEffect(() => {
    const el = row.current;
    if (!el || el.children.length < 2) return;
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) setAt(Array.prototype.indexOf.call(el.children, e.target));
      }
    }, { root: el, threshold: 0.6 });
    for (const child of Array.from(el.children)) seen.observe(child);
    return () => seen.disconnect();
  }, [items.length]);
  const go = (i: number) => row.current?.scrollTo({ left: i * row.current.clientWidth, behavior: "smooth" });

  return (
    <div className="flex flex-col gap-2.5">
      {/* No gap between items: each is exactly the row's width, so item i starts at
          i * clientWidth and the next one starts precisely at the edge, out of sight. */}
      <ul
        ref={row}
        aria-label={label}
        className={`flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${stackOnDesktop ? "md:flex-col md:gap-2.5 md:overflow-visible md:snap-none" : ""}`}
      >
        {items.map((child, i) => (
          // p-0.5: the row clips at its edges, and a card's ring is drawn just outside the card.
          <li key={i} className="flex w-full shrink-0 snap-start p-0.5" aria-roledescription="slide" aria-label={`${i + 1} of ${items.length}`}>
            {child}
          </li>
        ))}
      </ul>
      {items.length > 1 && (
        <div className={`flex justify-center gap-1.5 ${stackOnDesktop ? "md:hidden" : ""}`}>
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${i + 1} of ${items.length}`}
              aria-current={i === at ? "true" : undefined}
              className="flex h-6 items-center rounded-full px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={`block h-1.5 rounded-full transition-all ${i === at ? "w-4 bg-primary" : "w-1.5 bg-foreground/20"}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
