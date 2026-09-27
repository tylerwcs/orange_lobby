"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { LINE, winnerGrid } from "./winnerGrid";

/** The one place the LED shows a full name and company (D273): someone is walking on stage. */
export function WinnerCard({ label, name, company, prize }: { label: string; name: string; company: string; prize?: string | null }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 px-16 text-center">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-full w-[1100px] -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.28),transparent_65%)]" />
      <motion.div initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="font-game text-5xl uppercase tracking-[0.2em] text-white/90">{label}</motion.div>
      <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.15 }}
        className="max-w-[1780px] font-game text-[150px] leading-none drop-shadow-[0_8px_40px_var(--brand)]">{name}</motion.div>
      {company && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.85 }} transition={{ delay: 0.5 }} className="text-5xl">{company}</motion.div>}
      {prize && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 12, delay: 0.7 }}
          className="mt-6 rounded-full bg-[var(--brand)] px-14 py-5 font-game text-6xl shadow-[0_0_60px_var(--brand)]">{prize}</motion.div>
      )}
    </div>
  );
}

/** The page is 1080 tall: 48 + 48 of padding, a 48 px title and, with a prize, a 72 px prize line, 24 px apart. */
const GRID_HEIGHT = 1080 - 96 - 48 - 24;
const GRID_HEIGHT_WITH_PRIZE = GRID_HEIGHT - 72 - 24;
/** How long each page of a very long list of winners stays up. */
const PAGE_MS = 8000;

/**
 * Joint winners of last one standing, or a "draw all" (D272, D282). The grid is sized to the
 * count (see winnerGrid) so it never runs off the screen, however many winners there are.
 */
export function JointWinners({ title, winners, prize }: { title: string; winners: { name: string; company: string }[]; prize?: string | null }) {
  const g = winnerGrid(winners.length, prize ? GRID_HEIGHT_WITH_PRIZE : GRID_HEIGHT);
  const pages = Math.ceil(winners.length / g.perPage);
  const page = usePage(pages, PAGE_MS);
  const from = page * g.perPage;
  const shown = winners.slice(from, from + g.perPage);
  return (
    <div className="relative flex h-full flex-col items-center gap-6 overflow-hidden px-16 py-12">
      <div className="flex h-12 shrink-0 items-center font-game text-5xl uppercase leading-none tracking-[0.15em] text-[var(--brand)]">
        {title}
        {pages > 1 && <span className="ml-6 normal-case tracking-normal opacity-80">{from + 1}–{from + shown.length} of {winners.length}</span>}
      </div>
      {prize && <div className="h-[72px] max-w-full shrink-0 truncate text-7xl font-extrabold leading-none">{prize}</div>}
      <div className="grid w-full shrink-0 content-center"
        style={{
          height: prize ? GRID_HEIGHT_WITH_PRIZE : GRID_HEIGHT, gap: g.gap,
          gridTemplateColumns: `repeat(${g.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${g.rows}, ${g.cellHeight}px)`,
        }}>
        {shown.map((w, i) => (
          <motion.div key={from + i} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(1.5, i * 0.04) }}
            className="flex min-w-0 flex-col justify-center overflow-hidden rounded-2xl bg-white/10 text-center"
            style={{ padding: g.pad, lineHeight: LINE }}>
            <div className="truncate font-game" style={{ fontSize: g.font }}>{w.name}</div>
            {g.company && w.company && <div className="truncate opacity-70" style={{ fontSize: g.font * 0.6 }}>{w.company}</div>}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** Steps through `pages` every `ms`; always 0 when there is one page. */
function usePage(pages: number, ms: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (pages <= 1) return;
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [pages, ms]);
  return pages > 1 ? tick % pages : 0;
}
