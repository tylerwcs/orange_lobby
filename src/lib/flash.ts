/**
 * The one-line result of an action, carried from a server action to the page it lands on.
 *
 * A server action cannot hand anything to the browser except a redirect, so the message
 * rides in the query string and the client raises it as a toast and strips it. Keeping it
 * to two parameters with fixed names means every page can read a result without knowing
 * which action produced it.
 */
export type FlashTone = "ok" | "error";

export const FLASH_PARAMS = ["flash", "tone"] as const;

/** `path` may already carry a query; the flash is appended rather than replacing it. */
export function flashPath(path: string, message: string, tone: FlashTone = "ok"): string {
  const [base, existing = ""] = path.split("?");
  const params = new URLSearchParams(existing);
  params.set("flash", message);
  if (tone !== "ok") params.set("tone", tone);
  return `${base}?${params.toString()}`;
}

export function readFlash(params: { get(name: string): string | null }): { message: string; tone: FlashTone } | null {
  const message = params.get("flash");
  if (!message) return null;
  return { message, tone: params.get("tone") === "error" ? "error" : "ok" };
}

/**
 * The same address without the flash, so a reload does not announce a save that happened
 * a minute ago. Returns the query with its leading `?`, or an empty string.
 */
export function stripFlash(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of FLASH_PARAMS) params.delete(key);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}
