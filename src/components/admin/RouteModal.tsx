"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

/**
 * The dialog an intercepted route renders in. Opening an attendee from the table is a
 * client-side navigation, so the URL is real — the panel can be linked, refreshed into
 * the full page, and closed with the back button — while the list stays behind it.
 *
 * Two ways out, and they must not be confused. Dismissing it (Escape, the close button,
 * the backdrop) steps back in history so the URL matches what is on screen. Navigating
 * away — which is what saving does, since the save lands on the list — closes the dialog
 * where it stands: going back from there would undo the very navigation that finished the
 * task.
 */
export function RouteModal({ label, path, children }: { label: string; path: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  // Set false for the one close that must not rewind history.
  const dismissing = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (pathname === path) {
      if (!el.open) { dismissing.current = true; el.showModal(); }
      return;
    }
    if (el.open) { dismissing.current = false; el.close(); }
  }, [pathname, path]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={() => { if (dismissing.current) router.back(); }}
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
