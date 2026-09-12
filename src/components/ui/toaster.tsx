"use client";
import { useSyncExternalStore } from "react";
import { Check, Info, X } from "lucide-react";
import { dismissToast, getServerToasts, getToasts, subscribeToasts } from "@/lib/toast-store";

const TONE = {
  ok: "bg-foreground text-background",
  error: "bg-destructive-strong text-white",
} as const;

/**
 * Where every result of an action ends up. One fixed stack in the bottom corner, so a save
 * on the settings page and a save on the attendee panel are announced the same way, in the
 * same place, instead of each page growing its own banner above its own heading.
 *
 * Solid fills rather than the soft tints used inline: a toast floats over whatever content
 * happens to be underneath it and cannot rely on the page's own background for contrast.
 *
 * Deliberately NOT shadcn's toast (D71). This stack is driven by src/lib/toast-store.ts,
 * which is how a server action's redirect turns into an announcement - the flash arrives
 * in the URL, not from a click handler. Adopting shadcn's toast would mean rewriting that
 * store and the Flash component that feeds it, for no visual gain, on the surface that
 * reports whether a save worked. The styling is shadcn's; the plumbing stays.
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
          className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg p-3 pl-4 text-sm font-medium shadow-lg ${TONE[t.tone]}`}
        >
          {t.tone === "error"
            ? <Info className="mt-0.5 size-4 shrink-0" />
            : <Check className="mt-0.5 size-4 shrink-0" />}
          <p className="min-w-0 flex-1 py-1">{t.message}</p>
          <button
            type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)}
            className="flex size-7 shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
