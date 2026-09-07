/**
 * Returns `next` only when it is a safe same-origin path: it must start
 * with a single "/" and the second character must not be "/" or "\\".
 * A leading "//" or "/\\" is treated by browsers as a protocol-relative
 * URL (scheme-relative), which can redirect off-origin even though it
 * passes a naive `.startsWith("/")` check. Anything else (empty string,
 * a URL with a scheme, etc.) also falls back to "/admin".
 */
export function safeNextPath(next: string): string {
  if (next.length < 2) return "/admin";
  if (next[0] !== "/") return "/admin";
  if (next[1] === "/" || next[1] === "\\") return "/admin";
  return next;
}
