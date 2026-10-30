// What the qualifier page says (D772): the lines, the board's layout and the clock-driven phase.
// Pure, so the copy and its edge cases are tested without rendering.
import type { BoardEntry } from "./board";
import type { Phase } from "./phase";
import type { SkinId } from "./progress";
import { FINALISTS } from "./scoring";

/**
 * The phase the page should show now. The server's phase is read once at load; the window's
 * ends are crossed here by the clock, so "Opens in" turns into Fly without a reload. A confirm
 * still needs the server (it is the admin's act, not the clock's).
 */
export function livePhase(phase: Phase, opensAt: string | null, closesAt: string | null, now: number): Phase {
  if (phase !== "before" && phase !== "open") return phase;
  const closes = closesAt ? Date.parse(closesAt) : NaN;
  if (now >= closes) return "review";
  const opens = opensAt ? Date.parse(opensAt) : NaN;
  if (phase === "before" && now >= opens) return "open";
  return phase;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A countdown: "2d 4h", then "3h 05m", then "4:59". Seconds round up, so 0:00 is the end. */
export function untilText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${pad(m)}m`;
  return `${m}:${pad(s % 60)}`;
}

/** The smallest gap worth naming: wpm is kept to one decimal. */
const gapText = (cut: number, best: number) => Math.max(0.1, cut - best).toFixed(1);

/**
 * The "you dropped" banner (D771's `me.dropped`). Out of the top 10: the rank and, while runs
 * can still count, the wpm back to #10. Any other fall: "down to #N". Off the board: its own line.
 */
export function droppedText(
  dropped: { from: number; to: number | null } | null,
  p: { best: number | null; cutWpm: number | null; open: boolean },
): string | null {
  if (!dropped) return null;
  if (dropped.to === null) return "You've dropped off the board";
  if (dropped.from <= FINALISTS && dropped.to > FINALISTS) {
    const knocked = `You were knocked to #${dropped.to}`;
    return p.open && p.cutWpm !== null && p.best !== null ? `${knocked} — ${gapText(p.cutWpm, p.best)} wpm to get back in` : knocked;
  }
  return `You were knocked down to #${dropped.to}`;
}

/** The ready screen's line about the top 10. Shown only while the qualifier is open. */
export function gapLine(p: { best: number | null; rank: number | null; cutWpm: number | null }): string {
  if (p.rank !== null && p.rank <= FINALISTS) return "You're in the top 10";
  if (p.cutWpm === null) return "Fewer than 10 pilots so far — a finished run puts you in the top 10";
  if (p.best === null) return `#10 is flying at ${p.cutWpm.toFixed(1)} wpm`;
  return `${gapText(p.cutWpm, p.best)} wpm to the top 10`;
}

/** Once the window is shut there are no top-10 claims (spec, "When the window closes"). */
export function claimFree(line: string, phase: Phase): string {
  if (phase === "open") return line;
  return line.startsWith("New best!") ? "New best!" : line;
}

const pct = (v: number, scale: number) => Math.round((v / scale) * 1000) / 10;

/** The result's bar: the best and the #10 line on one scale, with a little headroom. */
export function cutBar(best: number | null, cut: number | null): { bestPct: number; cutPct: number | null } | null {
  if (best === null && cut === null) return null;
  const scale = Math.max(best ?? 0, cut ?? 0) * 1.1;
  return { bestPct: best === null ? 0 : pct(best, scale), cutPct: cut === null ? null : pct(cut, scale) };
}

export type FailReason = "early" | "late" | "done" | "refused";

/** Why a finished run did not count, in the player's words. */
export function failMessage(reason: FailReason): string {
  switch (reason) {
    case "late": return "That run didn't reach us in time — it doesn't count";
    case "done": return "You started another run elsewhere";
    default: return "That run couldn't be counted";
  }
}

export type BoardItem = { kind: "row"; entry: BoardEntry } | { kind: "cut" } | { kind: "gap" };

/**
 * The board top to bottom: the top 10, the finale cut (under the last row when fewer than 10
 * have flown), 11-20, then a gap row when the player's own rows don't follow on, and those rows.
 * `cut` is the last rank inside the cut: 10, or once confirmed the snapshot's last rank
 * (confirmedBoard), so no one placed after the confirm shows above it.
 */
export function boardLayout(top: readonly BoardEntry[], around: readonly BoardEntry[], cut: number = FINALISTS): BoardItem[] {
  if (top.length === 0 && around.length === 0) return [];
  const items: BoardItem[] = [];
  const inside = top.filter((r) => r.rank <= cut);
  for (const entry of inside) items.push({ kind: "row", entry });
  items.push({ kind: "cut" });
  for (const entry of top.filter((r) => r.rank > cut)) items.push({ kind: "row", entry });
  if (around.length > 0) {
    const last = top.length > 0 ? top[top.length - 1].rank : 0;
    if (around[0].rank > last + 1) items.push({ kind: "gap" });
    for (const entry of around) items.push({ kind: "row", entry });
  }
  return items;
}

/** The ship's and the board dot's colour. No skin chosen yet flies violet. */
const SKIN_COLOURS: Record<SkinId, string> = {
  violet: "#8b5cf6",
  teal: "#14b8a6",
  coral: "#fb7185",
  sky: "#38bdf8",
  amber: "#f59e0b",
  gold: "#eab308",
};
export const skinColour = (skin: SkinId | null): string => SKIN_COLOURS[skin ?? "violet"];
