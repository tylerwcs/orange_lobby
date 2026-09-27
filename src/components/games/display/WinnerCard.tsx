"use client";
import { useEffect, useState } from "react";
import { LINE, winnerGrid } from "./winnerGrid";

const COLOURS = ["#F97316", "#FACC15", "#22C55E", "#3B82F6", "#EC4899"];
// Fixed positions: the same shower on every render and every reload.
const PIECES = Array.from({ length: 90 }, (_, i) => ({
  left: (i * 37) % 100, delay: ((i * 53) % 30) / 10, duration: 3 + (i % 5) * 0.7,
  colour: COLOURS[i % COLOURS.length], rotate: (i * 47) % 360,
}));

export function Confetti() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {PIECES.map((p, i) => (
        <span key={i} className="confetti"
          style={{ left: `${p.left}%`, background: p.colour, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`, rotate: `${p.rotate}deg` }} />
      ))}
    </div>
  );
}

/** The one place the LED shows a full name and company (D273): someone is walking on stage. */
export function WinnerCard({ label, name, company, prize }: { label: string; name: string; company: string; prize?: string | null }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 px-16 text-center">
      <Confetti />
      <div className="text-5xl font-bold uppercase tracking-[0.2em] text-[var(--brand)]">{label}</div>
      <div className="max-w-[1780px] text-[140px] font-extrabold leading-none">{name}</div>
      {company && <div className="text-5xl opacity-80">{company}</div>}
      {prize && <div className="mt-6 rounded-full bg-[var(--brand)] px-12 py-4 text-5xl font-extrabold">{prize}</div>}
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
      <Confetti />
      <div className="flex h-12 shrink-0 items-center text-5xl font-bold uppercase leading-none tracking-[0.15em] text-[var(--brand)]">
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
          <div key={from + i} className="flex min-w-0 flex-col justify-center overflow-hidden rounded-2xl bg-white/10 text-center"
            style={{ padding: g.pad, lineHeight: LINE }}>
            <div className="truncate font-extrabold" style={{ fontSize: g.font }}>{w.name}</div>
            {g.company && w.company && <div className="truncate opacity-70" style={{ fontSize: g.font * 0.6 }}>{w.company}</div>}
          </div>
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
