/**
 * Ad hoc points (D704-D707): an organiser gives a group points, or takes some away, on a
 * tournament's or a scored challenge's overall leaderboard. Each is its own row with a reason the
 * organisers see; attendees see only the points, folded into the totals. Pure.
 */

export const MAX_ADJUSTMENT = 9999;
export const MAX_REASON = 120;

export type Adjustment = { id: string; activity_id: string; group_id: string; points: number; reason: string; added_by: string | null; created_at: string };

/** Each group's net adjustment; a group whose adjustments cancel out is left out. */
export function adjustmentTotals(rows: Pick<Adjustment, "group_id" | "points">[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.group_id, (out.get(r.group_id) ?? 0) + r.points);
  for (const [g, n] of out) if (n === 0) out.delete(g);
  return out;
}

/** D704: the Adjust points form - whole points, plus or minus, never 0, and a reason. Throws the organiser's sentence. */
export function readAdjustment(form: { text(key: string): string }): { points: number; reason: string } {
  const raw = form.text("points").replace(/^\+/, "");
  const points = Number(raw);
  if (!/^-?\d+$/.test(raw) || points === 0 || Math.abs(points) > MAX_ADJUSTMENT) {
    throw new Error(`Points must be a whole number from -${MAX_ADJUSTMENT} to ${MAX_ADJUSTMENT}, not 0.`);
  }
  const reason = form.text("reason");
  if (!reason) throw new Error("Say what the points are for.");
  if (reason.length > MAX_REASON) throw new Error(`Keep the reason to ${MAX_REASON} characters.`);
  return { points, reason };
}
