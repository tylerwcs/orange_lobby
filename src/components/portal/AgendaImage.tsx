"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/features/language/client";
import { EventImage } from "@/components/ui/event-image";
import type { ImageDims } from "@/lib/image-src";

/**
 * A picture on the agenda: a session's thumbnail, or an image row shown whole (D160, D196).
 *
 * The thumbnail is small on purpose. The agenda's job is to let somebody see their day at a
 * glance, and a day of full-width images is a scroll rather than a schedule — so the row
 * keeps its shape and the image earns its space only when somebody asks for it.
 *
 * A client component because a dialog needs state, and the only one on the portal agenda:
 * the rows around it stay server-rendered.
 */
export function AgendaImage({ src, title, variant = "thumb", dims }: {
  src: string;
  title: string;
  /** An image row's recorded size (D895), so the row holds its space before the picture arrives. */
  dims?: ImageDims;
  /**
   * "thumb": a session's picture, 44px on the row's trailing edge (D160). "full": an image
   * row (D196) - the picture IS the row, so it is shown whole at the column's width, never
   * cropped, and still opens full size when tapped.
   */
  variant?: "thumb" | "full";
}) {
  const d = useT();
  const [open, setOpen] = useState(false);
  const full = variant === "full";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={full
          ? "block w-full overflow-hidden rounded-[14px] border border-border bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          : "relative size-11 shrink-0 overflow-hidden rounded-[10px] border border-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"}
        /* The row already shows the title as text, so the button names its ACTION rather
           than repeating it — a screen reader hears "Show picture for Opening keynote"
           instead of the title twice in a row. */
        aria-label={full ? d.picture.open(title) : d.picture.show(title)}
      >
        {/* D894: sized copies; a thumbnail fills its 44px box, an image row the column's width. */}
        {full
          ? <EventImage src={src} dims={dims} sizes="(min-width: 768px) 896px, 100vw" className="h-auto w-full object-contain" />
          : <EventImage src={src} fill sizes="44px" className="object-cover" />}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(92vw,900px)] p-2">
          {/* Every dialog needs an accessible name; this one's content is a picture, so the
              name is the session it belongs to and is not drawn. */}
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <EventImage src={src} alt={title} dims={dims} sizes="(min-width: 980px) 900px, 92vw" eager className="h-auto max-h-[80vh] w-full rounded-[10px] object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
