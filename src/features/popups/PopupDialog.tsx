"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/features/language/client";
import { onTargetPage, opensThisVisit } from "./rules";
import type { PopupShown } from "./types";

/** As the home-screen popup: long enough for the page to settle and be seen first. */
const OPEN_AFTER_MS = 1500;

/**
 * The organiser's popup (D751): their heading, message and button, in the home-screen popup's
 * look. The server decides which one applies (D752); this only decides when to open it.
 *
 * Once per open of the portal (D753): it lives in the personal layout, which stays mounted
 * while the attendee moves between tabs, so remembering that it showed keeps any popup from
 * coming back on every tab. A fresh load - the WhatsApp link again, a refresh - shows it again,
 * for as long as the server still says it applies. Not on the page its button leads to.
 */
export function PopupDialog({ popup, basePath }: { popup: PopupShown | null; basePath: string }) {
  const d = useT().popup;
  const router = useRouter();
  const pathname = usePathname();
  const shown = useRef(false);
  const [open, setOpen] = useState(false);
  const id = popup?.id ?? null;
  const here = popup ? onTargetPage(pathname, basePath, popup.activity_id) : false;

  useEffect(() => {
    if (!opensThisVisit({ popupId: id, onTarget: here, shownThisOpen: shown.current })) return;
    const timer = window.setTimeout(() => {
      shown.current = true;
      setOpen(true);
    }, OPEN_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [id, here]);

  if (!popup) return null;
  const go = () => {
    setOpen(false);
    router.push(`${basePath}/activities/${popup.activity_id}`);
  };

  return (
    // Done elsewhere in the meantime (booked, so the server sends null) and it is gone.
    <Dialog open={open && !here} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false} className="max-h-[90dvh] gap-5 overflow-y-auto">
        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          <DialogTitle className="text-lg font-extrabold leading-tight text-balance">{popup.heading}</DialogTitle>
          {/* A div, not the default <p>: the organiser's message is paragraphs and lists of its own. */}
          <DialogDescription
            render={<div />}
            className="rich-text prose prose-sm max-w-none text-center text-balance"
            dangerouslySetInnerHTML={{ __html: popup.message_html }}
          />
        </div>
        <Button className="h-11 w-full text-base font-bold" onClick={go}>{popup.button_label}</Button>
        <Button variant="ghost" className="-mt-2 w-full text-muted-foreground" onClick={() => setOpen(false)}>{d.notNow}</Button>
      </DialogContent>
    </Dialog>
  );
}
