"use client";
import { useEffect, useState, type RefObject } from "react";
import { QrCode } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Reveal } from "../../lib/booths";
import { pollRevealsAction } from "../../portal/actions";

const POLL_MS = 2000;

/**
 * D852: Show my QR. The attendee's own QR in a dialog, the same picture and white tile as the
 * badge's (BadgeQrDialog), with its own line - the badge's is about check-in. While it is open and
 * the page is in front, it asks every ~2 s for stamps newer than `after`; the first that arrive
 * close it and go to the reveal. A repeat scan makes no new stamp, so the dialog just keeps
 * waiting. Polling also stops while a reveal is playing (`paused`).
 */
export function PassportQr({ slug, token, activityId, qr, after, paused, onArrived }: {
  slug: string;
  token: string;
  activityId: string;
  qr: string;
  after: RefObject<string | null>;
  paused: boolean;
  onArrived: (found: Reveal[]) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || paused) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          const found = await pollRevealsAction(slug, token, activityId, after.current);
          if (stopped) return;
          if (found.length > 0) {
            setOpen(false);
            onArrived(found);
            return;
          }
        } catch {
          // A dropped request is the next tick's to retry: the dialog keeps waiting either way.
        }
      }
      // Scheduled after the answer, never on a fixed beat, so two requests never overlap.
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => { stopped = true; clearTimeout(timer); };
  }, [open, paused, slug, token, activityId, after, onArrived]);

  return (
    <>
      <div className="sticky bottom-4 z-10 mt-4">
        <Button size="lg" className="h-12 w-full gap-2 rounded-full text-base font-bold shadow-lg" onClick={() => setOpen(true)}>
          <QrCode data-icon="inline-start" />
          Show my QR
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle className="text-center">Show this to the booth</DialogTitle>
          <DialogDescription className="text-center">The booth scans it to stamp your passport.</DialogDescription>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Your QR code" width={240} height={240} /* theme-fixed: QR on white (D627) */ className="mx-auto box-content size-60 rounded-lg bg-white p-3" />
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <span aria-hidden="true" className="size-2 rounded-full bg-primary motion-safe:animate-pulse" />
            Waiting for the booth…
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
