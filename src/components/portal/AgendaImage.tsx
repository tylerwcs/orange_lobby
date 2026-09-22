"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * A session's picture on the agenda: a thumbnail in the row, the whole thing when tapped
 * (D160).
 *
 * The thumbnail is small on purpose. The agenda's job is to let somebody see their day at a
 * glance, and a day of full-width images is a scroll rather than a schedule — so the row
 * keeps its shape and the image earns its space only when somebody asks for it.
 *
 * A client component because a dialog needs state, and the only one on the portal agenda:
 * the rows around it stay server-rendered.
 */
export function AgendaImage({ src, title }: { src: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="size-11 shrink-0 overflow-hidden rounded-[10px] border border-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        /* The row already shows the title as text, so the button names its ACTION rather
           than repeating it — a screen reader hears "Show picture for Opening keynote"
           instead of the title twice in a row. */
        aria-label={`Show picture for ${title}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="size-full object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(92vw,900px)] p-2">
          {/* Every dialog needs an accessible name; this one's content is a picture, so the
              name is the session it belongs to and is not drawn. */}
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={title} className="max-h-[80vh] w-full rounded-[10px] object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
