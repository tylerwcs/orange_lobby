"use client";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { AttendeeDetailSkeleton } from "@/components/admin/AttendeeDetailSkeleton";

/**
 * The attendee panel, over the list it was opened from.
 *
 * Driven by a query parameter rather than an intercepted route. Interception is the
 * idiomatic way to do this and it is what shipped first, but Next generates a rewrite
 * whose destination carries the literal marker — `/admin/events/:id/attendees/(.):attendeeId`
 * — and path-to-regexp reads `(.)` as an unnamed capture group rather than as text. Every
 * client-side navigation to an attendee 500s on the RSC request and silently falls back to
 * a full page load, so the dialog never appeared. A query parameter has none of that: the
 * URL is still real, still linkable, and a hard load of it opens the same panel over the
 * same list.
 */
export function AttendeeDialog({ openId, pending, children, onClose }: {
  openId: string | null;
  pending: boolean;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (openId && !el.open) el.showModal();
    else if (!openId && el.open) el.close();
  }, [openId]);

  return (
    <dialog
      ref={ref}
      aria-label="Attendee"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      // `m-auto` is load-bearing: a dialog centres itself through the user-agent's
      // `margin: auto`, which Tailwind's preflight zeroes on every element.
      className="m-auto w-[min(94vw,960px)] rounded-[var(--radius-card)] bg-surface p-0 text-ink shadow-[var(--shadow-card)] backdrop:bg-ink/40"
    >
      <div className="flex justify-end p-3 pb-0">
        <button type="button" aria-label="Close" onClick={() => ref.current?.close()}
          className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] text-muted transition-colors duration-150 hover:bg-canvas">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto px-5 pb-5">
        {/* The panel is server-rendered, so it arrives a round trip after the dialog does. */}
        {pending || !children ? <AttendeeDetailSkeleton /> : children}
      </div>
    </dialog>
  );
}
