"use client";

import { useEffect, useMemo, useState } from "react";
import type { Announcement } from "@/lib/types";
import { Icon } from "@/components/ui/icon";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AnnouncementList } from "./AnnouncementList";
import { HomeScreenRow } from "./AddToHomeScreen";

/** How long each announcement holds before the next slides up. */
const HOLD_MS = 4000;

/**
 * The phone home's one line about what changed, which opens every announcement in place.
 *
 * It used to link to /announcements. Reading one message cost a page load and a trip back, and
 * the message that brought somebody here is rarely the only one they missed — so the dialog
 * shows the whole list in the organiser's order (`listAnnouncements`), the same way `AgendaImage`
 * opens a picture without leaving the agenda.
 *
 * `a` is the banner's own line — the pinned one, else the first in the organiser's order (D249)
 * — passed separately from `items` so the banner does not depend on which comes first. Its
 * second line is the start of the message rather than when it was posted.
 *
 * With more than one announcement the lines take turns, sliding up like a search box cycling
 * its suggestions: `a` first, then the rest in the organiser's order, and round again. Only the
 * text moves; the box stays put. The track ends with a copy of the first line so the last one
 * slides into it, then snaps back to the real first line with no transition, which reads as
 * one unbroken loop. It holds still while it is being touched, hovered or focused, while the
 * dialog is open, while the tab is hidden, and always under reduced motion.
 */
export function AnnouncementBanner({ a, items }: { a: Announcement; items: Announcement[] }) {
  const [open, setOpen] = useState(false);
  const slides = useMemo(() => [a, ...items.filter((i) => i.id !== a.id)], [a, items]);
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [held, setHeld] = useState(false);
  const still = useStill();
  const rotating = slides.length > 1 && !open && !held && !still;

  useEffect(() => {
    if (!rotating) return;
    const id = setInterval(() => {
      setAnimate(true);
      setIndex((i) => i + 1);
    }, HOLD_MS);
    return () => clearInterval(id);
  }, [rotating]);

  // A refresh can leave fewer announcements than the line on show; start again from the top.
  const at = index > slides.length ? 0 : index;
  const track = slides.length > 1 ? [...slides, slides[0]] : slides;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
        className="flex w-full items-center gap-3 rounded-[12px] bg-accent px-3.5 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-haspopup="dialog"
      >
        <Icon name="megaphone" size={20} className="shrink-0 text-primary" />
        {/* A name that changes every few seconds is noise to a screen reader: it hears `a` alone. */}
        <span className="sr-only">{a.title}</span>
        <div className="h-9 min-w-0 flex-1 overflow-hidden" aria-hidden>
          <div
            className={animate ? "transition-transform duration-500 ease-in-out" : undefined}
            style={{ transform: `translateY(-${at * 2.25}rem)` }}
            onTransitionEnd={(e) => {
              if (e.target !== e.currentTarget || at < slides.length) return;
              setAnimate(false);
              setIndex(0);
            }}
          >
            {track.map((s, i) => (
              <div key={i} className="h-9">
                <div className="truncate text-sm font-bold text-primary">{s.title}</div>
                <div className="truncate text-xs text-primary">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
        <Icon name="chevron" size={18} className="text-primary" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-3">
          <DialogTitle className="text-lg font-extrabold">Announcements</DialogTitle>
          <div className="-mx-1 min-h-0 overflow-y-auto px-1 pb-1">
            <AnnouncementList items={items} />
            {/* The home-screen guide stays reachable here after its first popup (D232). */}
            <HomeScreenRow variant="row" onOpen={() => setOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** True while the page is hidden or the viewer asks for reduced motion. */
function useStill() {
  const [still, setStill] = useState(false);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setStill(motion.matches || document.hidden);
    update();
    motion.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      motion.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return still;
}
