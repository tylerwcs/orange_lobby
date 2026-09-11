"use client";
import { useSyncExternalStore } from "react";
import { dismissToast, getServerToasts, getToasts, subscribeToasts } from "@/lib/toast-store";
import { Icon } from "@/components/ui/Icon";

const TONE = {
  ok: "bg-ink text-white",
  error: "bg-danger-strong text-white",
} as const;

/**
 * Where every result of an action ends up. One fixed stack in the bottom corner, so a save
 * on the settings page and a save on the attendee panel are announced the same way, in the
 * same place, instead of each page growing its own banner above its own heading.
 *
 * Solid fills rather than the soft tints used inline: a toast floats over whatever content
 * happens to be underneath it and cannot rely on the page's own background for contrast.
 */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getServerToasts);
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : undefined}
          className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-[var(--radius-control)] p-3 pl-4 text-sm font-semibold shadow-[var(--shadow-card)] ${TONE[t.tone]}`}
        >
          <Icon name={t.tone === "error" ? "info" : "check"} size={18} className="mt-px shrink-0" />
          <p className="min-w-0 flex-1 py-1.5">{t.message}</p>
          <button
            type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-white/70 transition-colors duration-150 hover:bg-white/15 hover:text-white"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
