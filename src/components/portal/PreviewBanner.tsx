import { Eye } from "lucide-react";

/**
 * D714: across the top of a draft event's portal, for the admin or committee member previewing
 * it as it will look live. On a personal link it also warns that what they do is saved as that
 * attendee: bookings, entries and the rest run as normal.
 */
export function PreviewBanner({ personal }: { personal: boolean }) {
  return (
    <div role="status" className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">
      <Eye aria-hidden className="size-4 shrink-0" />
      <span>
        Preview. This event is in Draft, so attendees still see &ldquo;Coming soon&rdquo;.
        {personal && " Anything you do here is saved to this attendee."}
      </span>
    </div>
  );
}
