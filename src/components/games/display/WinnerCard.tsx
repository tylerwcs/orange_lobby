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

/** Joint winners of last one standing, or a "draw all" (D272, D282). */
export function JointWinners({ title, winners, prize }: { title: string; winners: { name: string; company: string }[]; prize?: string | null }) {
  const cols = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(winners.length))));
  const size = winners.length > 20 ? 30 : winners.length > 9 ? 40 : 56;
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-10 px-16">
      <Confetti />
      <div className="text-5xl font-bold uppercase tracking-[0.15em] text-[var(--brand)]">{title}</div>
      {prize && <div className="text-7xl font-extrabold">{prize}</div>}
      <div className="grid w-full gap-5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {winners.map((w, i) => (
          <div key={i} className="rounded-2xl bg-white/10 p-5 text-center">
            <div className="truncate font-extrabold" style={{ fontSize: size }}>{w.name}</div>
            {w.company && <div className="truncate opacity-70" style={{ fontSize: size * 0.6 }}>{w.company}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
