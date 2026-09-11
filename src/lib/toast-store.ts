import type { FlashTone } from "@/lib/flash";

export type Toast = { id: number; message: string; tone: FlashTone };

/**
 * Toasts live in a module-level store rather than React state, read through
 * `useSyncExternalStore`. Two reasons: any client component can raise one without a
 * provider threading callbacks down to it, and raising one from an effect — which is
 * exactly what reading a flash out of the URL has to do — is then a call into an external
 * system rather than a setState cascade.
 */
const DISMISS_AFTER = 6000;
const EMPTY: Toast[] = [];

let toasts: Toast[] = EMPTY;
let nextId = 1;
const listeners = new Set<() => void>();

function publish(next: Toast[]) {
  toasts = next;
  for (const listen of listeners) listen();
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getToasts(): Toast[] {
  return toasts;
}

/** The server has no toasts, and must return a stable reference or rendering never settles. */
export function getServerToasts(): Toast[] {
  return EMPTY;
}

export function dismissToast(id: number) {
  publish(toasts.filter((t) => t.id !== id));
}

export function toast(message: string, tone: FlashTone = "ok"): number {
  const id = nextId++;
  publish([...toasts, { id, message, tone }]);
  // Errors stay twice as long: they are the ones worth reading twice, and the ones a
  // reader is least likely to be looking at the corner of the screen for.
  setTimeout(() => dismissToast(id), tone === "error" ? DISMISS_AFTER * 2 : DISMISS_AFTER);
  return id;
}

/** Test seam: the store outlives any one component, so a suite has to be able to empty it. */
export function clearToasts() {
  publish(EMPTY);
}
