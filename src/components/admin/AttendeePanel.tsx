"use client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AttendeeDetailSkeleton } from "@/components/admin/AttendeeDetailSkeleton";

/**
 * The attendee record, over the list it was opened from. Since D70 this is the only place
 * the record exists - there is no standalone attendee route behind it.
 *
 * Driven by a query parameter rather than an intercepted route. Interception is the
 * idiomatic way to do this and it is what shipped first, but Next generates a rewrite
 * whose destination carries the literal marker - `/admin/events/:id/attendees/(.):attendeeId`
 * - and path-to-regexp reads `(.)` as an unnamed capture group rather than as text. Every
 * client-side navigation to an attendee 500s on the RSC request and silently falls back to
 * a full page load, so the panel never appeared. A query parameter has none of that: the
 * URL is still real, still linkable, and a hard load of it opens the same panel over the
 * same list.
 *
 * A side sheet rather than a centred modal: the list stays visible alongside it, which is
 * what you want when you are working down a roster rather than studying one person.
 */
export function AttendeePanel({ openId, pending, children, onClose }: {
  openId: string | null;
  pending: boolean;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!openId} onOpenChange={(open) => { if (!open) onClose(); }}>
      {/* The width override carries the same data-side variant as the base class, or the
          stock `data-[side=right]:sm:max-w-sm` wins and the panel stays 384px wide. */}
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 data-[side=right]:sm:max-w-xl">
        <SheetHeader className="sr-only">
          {/* The panel's own header carries the visible identity; this is here so the sheet
              is announced with a name rather than as an unlabelled region. */}
          <SheetTitle>Attendee</SheetTitle>
          <SheetDescription>Check-in state, seating and registration answers.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {/* The panel is server-rendered, so it arrives a round trip after the sheet does. */}
          {pending || !children ? <AttendeeDetailSkeleton /> : children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
