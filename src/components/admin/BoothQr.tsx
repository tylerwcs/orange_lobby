"use client";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/text";

/**
 * The A5 sheet a booth actually gets, one per booth. It lives inside the admin shell
 * (sidebar, header chrome), so printing "the page" would print all of that too — the
 * scoped stylesheet below hides everything except `#booth-sheet` when the browser's
 * print dialog opens, wherever in the tree this component happens to render.
 *
 * The staff-only band is not boilerplate: the link on this sheet IS the stamping
 * authority, and a photo of it in an attendee's camera roll is a booth that stamps
 * itself.
 */
export function BoothQr({ boothName, location, eventName, link, qr }: {
  boothName: string;
  location: string | null;
  eventName: string;
  link: string;
  qr: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <style>{`
        @media print {
          @page { size: A5; margin: 0; }
          body * { visibility: hidden; }
          #booth-sheet, #booth-sheet * { visibility: visible; }
          #booth-sheet { position: fixed; inset: 0; box-shadow: none; }
        }
      `}</style>

      <Button type="button" onClick={() => window.print()} className="h-11 px-4 font-bold print:hidden">
        <Icon name="qr" size={16} />
        Print this sheet
      </Button>

      {/* A5 at 96px/in (559x794). Sized for the longest booth name in the list, not the
          shortest — the name below reserves two lines rather than one, so it cannot push
          the QR or the staff-only band off the sheet. */}
      <div
        id="booth-sheet"
        className="flex w-[559px] min-h-[794px] flex-col gap-3.5 bg-card p-10 pb-8 text-foreground shadow-sm ring-1 ring-border"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[10px] bg-brand text-[11px] font-bold text-brand-foreground">
            {initials(eventName)}
          </span>
          <span className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
            {eventName} · Booth scanner
          </span>
        </div>

        <div>
          <div className="line-clamp-2 text-4xl font-extrabold leading-[1.08] tracking-[-0.015em] text-balance">
            {boothName}
          </div>
          {location && <div className="mt-1.5 text-base text-muted-foreground">{location}</div>}
        </div>

        <div className="h-0.5 shrink-0 bg-foreground" />

        <div className="flex flex-col items-center gap-3">
          <p className="text-center text-lg font-extrabold">Staff: open this once, then keep it open</p>
          <div className="rounded-2xl border border-border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Booth scanner QR code" width={210} height={210} className="size-[210px]" />
          </div>
          <div className="break-all text-center font-mono text-base font-bold text-muted-foreground">{link}</div>
        </div>

        <p className="text-base leading-relaxed text-pretty">
          Scan each attendee&apos;s badge QR to stamp their Booth Passport. It stamps{" "}
          <strong className="font-extrabold">this booth only</strong>, and a second scan of the same badge is harmless.
        </p>

        {/* Required copy, not boilerplate — see the file comment. */}
        <div className="rounded-2xl bg-accent px-3.5 py-3 text-base font-extrabold leading-snug text-accent-foreground">
          Staff only. Do not show this sheet or this link to attendees.
        </div>

        <div className="grow" />

        <p className="text-xs text-muted-foreground">Lost the sheet? Reprint it from Admin → Booths.</p>
      </div>
    </div>
  );
}
