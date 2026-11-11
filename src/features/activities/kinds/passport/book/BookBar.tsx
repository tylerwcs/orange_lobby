"use client";
import { useState, type ReactNode } from "react";
import { Check, MapPin, Stamp } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { progressLine, type Passport } from "../../../lib/booths";

/** The book's round light-on-dark buttons, on its own dark stage (not the portal's theme). */
export const BOOK_BUTTON = "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white/12 px-5 text-base font-bold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"; // theme-fixed: the book's own dark stage, like the polaroid camera

/**
 * D879: under the open passport. "Show my QR" (the dialog and its poll, as before) and "Booths",
 * a sheet with every booth stamped or not yet, where it is, the progress line, the reward once
 * the card is full, and the organiser's About. The stamp page has no empty slots, so this is
 * where a guest finds where to go next.
 */
export function BookBar({ passport, qrButton, reward, about, note }: {
  passport: Passport;
  /** The Show my QR button, rendered by PassportQr with the book's trigger; null when it doesn't show (`qrButtonShown`). */
  qrButton: ReactNode;
  reward: string | null;
  about: ReactNode;
  /** Shown above the buttons: what to do next ("Visit the booths…", "Stamping opens soon.") and how far along. */
  note: { line: string; sub: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
      {note && (
        <div className="flex flex-col items-center gap-0.5 text-center">
          <p className="text-sm font-semibold text-white/90" /* theme-fixed: on the book's dark stage */>{note.line}</p>
          {note.sub && <p className="text-xs tabular-nums text-white/70" /* theme-fixed: on the book's dark stage */>{note.sub}</p>}
        </div>
      )}
      <div className="flex w-full max-w-[560px] gap-2">
        {/* Without Show my QR (the card full, stamping shut), Booths takes the whole row. */}
        {qrButton && <div className="flex-1 [&>*]:w-full">{qrButton}</div>}
        <button type="button" className={`${BOOK_BUTTON} ${qrButton ? "" : "flex-1"}`} onClick={() => setOpen(true)}>
          <Stamp aria-hidden className="size-5" />
          Booths
        </button>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>Booths</SheetTitle>
            <p className="text-sm font-semibold text-muted-foreground tabular-nums">{progressLine(passport)}</p>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            {passport.complete && reward && (
              <p className="rounded-lg bg-primary/10 p-3 text-sm font-semibold text-foreground">{reward}</p>
            )}
            <ul className="flex flex-col divide-y divide-border">
              {passport.cells.map((c) => (
                <li key={c.booth.id} className="flex items-center gap-3 py-3">
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${c.stampedAt ? "bg-primary text-primary-foreground" : "border border-dashed border-muted-foreground/50 text-muted-foreground"}`}>
                    {c.stampedAt ? <Check aria-hidden className="size-4" /> : <Stamp aria-hidden className="size-4" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-bold">{c.booth.name}</span>
                    {c.booth.location && (
                      c.booth.location_url
                        ? <a href={c.booth.location_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-muted-foreground underline underline-offset-2"><MapPin aria-hidden className="size-3.5" />{c.booth.location}</a>
                        : <span className="text-sm text-muted-foreground">{c.booth.location}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-muted-foreground">{c.stampedAt ? "Stamped" : "Not yet"}</span>
                </li>
              ))}
            </ul>
            {about && (
              <section className="flex flex-col gap-2 border-t border-border pt-4">
                <h3 className="text-sm font-extrabold uppercase tracking-wide text-muted-foreground">About</h3>
                {about}
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
