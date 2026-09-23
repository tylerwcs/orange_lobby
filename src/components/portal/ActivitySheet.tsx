"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * A card on the Activities tab that opens the activity in a sheet from the bottom of the screen.
 *
 * Only the open/closed state lives here. The card's face and the sheet's body are both
 * rendered on the server and passed in, so the session rows keep their server-action forms
 * exactly as they were — this component never learns what an activity is.
 *
 * A sheet rather than a page: picking a session is a short choice made from a list, and a
 * sheet leaves that list where it was underneath. A booking redirects back to the tab, which
 * moves the activity to a different section — a different instance of this component — so the
 * sheet it was booked from closes by itself and the toast is what is left on screen.
 */
export function ActivitySheet({ face, title, badge, description, emphasis = false, children }: {
  face: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  description?: string;
  /** Draws the card in the brand colour: the activity is owed. */
  emphasis?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`w-full rounded-xl bg-card p-3.5 text-left ring-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-background ${emphasis ? "ring-primary" : "ring-foreground/10"}`}
      >
        {face}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[85vh] w-full max-w-md gap-0 overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="pr-12">
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle className="text-lg font-extrabold">{title}</SheetTitle>
              {badge}
            </div>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
          <div className="px-4">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
