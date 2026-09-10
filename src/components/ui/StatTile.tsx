import { Icon, type IconName } from "./Icon";

export type TileTint = "ok" | "pink" | "sky" | "lilac" | "slate" | "brand";

const TINT: Record<TileTint, string> = {
  ok: "bg-ok-soft text-ok-strong",
  pink: "bg-tint-pink text-[#A03A78]",
  sky: "bg-tint-sky text-[#1D4ED8]",
  lilac: "bg-tint-lilac text-[#5B4BC4]",
  slate: "bg-tint-slate text-muted",
  brand: "bg-brand-soft text-brand-ink",
};

export function StatTile({ label, value, icon, tint = "slate" }: { label: string; value: string | number; icon: IconName; tint?: TileTint }) {
  const [ground, ink] = TINT[tint].split(" ");
  return (
    <div className={`flex flex-col gap-2.5 rounded-[var(--radius-card)] p-4 ${ground}`}>
      <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-white/75 ${ink}`}><Icon name={icon} size={17} /></div>
      <div>
        <div className="text-3xl font-extrabold leading-none tabular-nums">{value}</div>
        <div className="mt-1 text-xs font-semibold text-muted">{label}</div>
      </div>
    </div>
  );
}
