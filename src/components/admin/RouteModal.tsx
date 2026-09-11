"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

/**
 * The dialog an intercepted route renders in. Opening an attendee from the table is a
 * client-side navigation, so the URL is real — the panel can be linked, refreshed into
 * the full page, and closed with the back button — while the list stays behind it.
 *
 * `onClose` is the single way out: it catches Escape, the close button and the backdrop
 * alike, and steps back in history so the URL matches what is on screen.
 */
export function RouteModal({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={() => router.back()}
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
      <div className="max-h-[75vh] overflow-y-auto px-5 pb-5">{children}</div>
    </dialog>
  );
}
