"use client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { StickerDef } from "../lib/stickers";

/** One tray (D482): the event's own stickers first, then the built-ins, no tabs. */
export function StickerTray({ open, onOpenChange, stickers, onPick }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stickers: StickerDef[];
  onPick: (id: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[70dvh] overflow-y-auto">
        <SheetHeader><SheetTitle>Stickers</SheetTitle></SheetHeader>
        <div className="grid grid-cols-4 gap-3 px-4 pb-6 sm:grid-cols-6">
          {stickers.map((s) => (
            <button key={s.id} type="button" aria-label={s.name} onClick={() => onPick(s.id)}
              className="flex aspect-square items-center justify-center rounded-xl bg-muted p-2 transition-transform active:scale-95">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.src} alt="" className="size-full object-contain" />
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
