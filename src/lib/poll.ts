/** Server time minus the midpoint of the request: add it to Date.now() for server time (D257). */
export function clockOffset(sentAt: number, receivedAt: number, serverNow: number): number {
  return serverNow - (sentAt + receivedAt) / 2;
}

/** Wait after `failures` failed polls in a row: 1 s, 2 s, 4 s, then 8 s (D262). */
export function backoff(failures: number): number {
  return Math.min(8000, 1000 * 2 ** Math.max(0, failures - 1));
}
