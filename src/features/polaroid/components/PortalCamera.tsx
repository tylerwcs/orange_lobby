"use client";
import { useCallback, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Images } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DangerButton } from "@/components/admin/DangerButton";
import { toast } from "@/lib/toast-store";
import { sanitizeHtml } from "@/lib/sanitize";
import { isRichTextEmpty, toRichHtml } from "@/lib/rich-text";
import { handFont } from "../font";
import type { StickerDef } from "../lib/stickers";
import type { CardData } from "../lib/wire";
import type { PostInput, PostResult, RemoveResult, StartResult } from "../lib/post-types";
import { PolaroidCard } from "./PolaroidCard";
import { PolaroidComposer, STAGE_ROUND_BUTTON } from "./PolaroidComposer";

const noSubscribe = () => () => {};
const GAP = 16;

type Item = CardData & { id: string };

/**
 * A polaroid wall in the portal (D482): the page is the camera. The full-screen composer is always
 * open; its × goes back to the attendee's home (`homePath`), and the round button in its top-right
 * corner opens "Your polaroids", a bottom drawer with the organiser's About and what this attendee
 * has up, each removable. After a post the server page re-renders, so the new `items` arrive here
 * without the composer remounting. Once in the browser the stage is drawn into `document.body`, so
 * the portal's chrome can't clip it; before that it renders in place, so the server's HTML already
 * shows the camera.
 */
export function PortalCamera({ homePath, about, items, stickerSrc, remove, ...composer }: {
  prompt: string;
  stickers: StickerDef[];
  start: () => Promise<StartResult>;
  post: (input: PostInput) => Promise<PostResult>;
  brand?: string | null;
  homePath: string;
  /** The activity's description, as stored. */
  about: string | null;
  items: Item[];
  stickerSrc: Record<string, string>;
  remove: (id: string) => Promise<RemoveResult>;
}) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);

  const stage = (
    <PolaroidComposer {...composer} onClose={() => router.push(homePath)} blockEscape={drawerOpen}
      corner={(posting) => (
        <button type="button" aria-label="Your polaroids" onClick={() => setDrawerOpen(true)} disabled={posting}
          className={`relative ${STAGE_ROUND_BUTTON}`}>
          <Images aria-hidden className="size-5" />
          {items.length > 0 && (
            <span aria-hidden className="absolute -bottom-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold leading-none tabular-nums text-black">
              {items.length}
            </span>
          )}
        </button>
      )} />
  );

  return (
    <>
      {inBrowser ? createPortal(stage, document.body) : stage}
      <YourPolaroidsDrawer open={drawerOpen} onOpenChange={setDrawerOpen} about={about} items={items} stickerSrc={stickerSrc} remove={remove} />
    </>
  );
}

/** "Your polaroids": the organiser's About, then this attendee's posts two to a row, each removable. */
function YourPolaroidsDrawer({ open, onOpenChange, about, items, stickerSrc, remove }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  about: string | null;
  items: Item[];
  stickerSrc: Record<string, string>;
  remove: (id: string) => Promise<RemoveResult>;
}) {
  const html = sanitizeHtml(toRichHtml(about));
  // Two cards to a row, as wide as the drawer allows.
  const [width, setWidth] = useState(148);
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor((e.contentRect.width - GAP) / 2)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Above the full-screen composer (z-[100]), like the sticker tray. */}
      <SheetContent side="bottom" className={`${handFont.variable} z-[110] max-h-[80dvh] overflow-y-auto`}>
        <div className="mx-auto flex w-full max-w-md flex-col">
          <SheetHeader><SheetTitle className="text-lg font-extrabold">Your polaroids</SheetTitle></SheetHeader>
          {!isRichTextEmpty(html) && (
            <details className="group mx-4 mb-2 rounded-lg bg-muted px-3 py-2">
              <summary className="cursor-pointer text-sm font-bold">About</summary>
              <div className="rich-text prose prose-sm mt-2 max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
            </details>
          )}
          <div ref={measure} className="px-4 pb-6">
            {items.length === 0 ? (
              <p className="py-8 text-center text-2xl text-muted-foreground" style={{ fontFamily: "var(--font-hand)", fontWeight: 700 }}>
                Nothing posted yet. Your polaroids show up here.
              </p>
            ) : (
              <ul className="grid grid-cols-2 pt-3" style={{ gap: GAP }}>
                {items.map((p) => (
                  <li key={p.id} className="flex flex-col items-center gap-2">
                    <PolaroidCard card={p} width={width} stickerSrc={stickerSrc} loading="lazy" />
                    <DangerButton size="sm" layer="z-[120]" message="This takes it off the wall and deletes the photo."
                      action={async () => {
                        const r = await remove(p.id);
                        toast(r.ok ? "Removed from the wall." : r.error, r.ok ? "ok" : "error");
                      }}>
                      Remove
                    </DangerButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
