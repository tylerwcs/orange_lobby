"use client";

import type { ReactElement } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useT } from "@/features/language/client";

/**
 * The attendee's QR, in a dialog, from wherever they reach for it.
 *
 * The badge on the home screen used to link to the Me page, where this same dialog sat behind
 * a second button - two steps to show a code at a door. Both places now open this component,
 * so the code and the words around it cannot drift apart.
 *
 * `qr` is a data URL made on the server (`qrDataUrl`), so the dialog opens without a request.
 * `trigger` is the element that opens it, rendered as-is: a square icon on the badge, a full
 * button on the Me page.
 */
export function BadgeQrDialog({ qr, name, trigger }: { qr: string; name: string; trigger: ReactElement }) {
  const d = useT();
  return (
    <Dialog>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-sm">
        <DialogTitle className="text-center">{name}</DialogTitle>
        <DialogDescription className="text-center">
          {d.badge.qrHelp}
        </DialogDescription>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={d.badge.qrAlt} width={240} height={240} /* theme-fixed: QR on white (D627) */ className="mx-auto box-content size-60 rounded-lg bg-white p-3" />
      </DialogContent>
    </Dialog>
  );
}
