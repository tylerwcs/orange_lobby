export const BADGE_TONES = ["ok", "warn", "danger", "brand", "neutral", "ink"] as const;
export type BadgeTone = (typeof BADGE_TONES)[number];

const TONE: Record<BadgeTone, string> = {
  ok: "bg-ok-soft text-ok-strong",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger-strong",
  brand: "bg-brand-soft text-brand-ink",
  neutral: "bg-tint-slate text-muted",
  ink: "bg-ink text-white",
};

const DOT: Record<BadgeTone, string> = {
  ok: "bg-ok", warn: "bg-warn", danger: "bg-danger",
  brand: "bg-brand", neutral: "bg-muted", ink: "bg-white",
};

/** Class string for a status pill. Kept separate from the component so plain `<span>`s can share it. */
export function badgeClass(tone: BadgeTone = "neutral"): string {
  return `inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${TONE[tone]}`;
}

export function Badge({ children, tone = "neutral", dot = false }: { children: React.ReactNode; tone?: BadgeTone; dot?: boolean }) {
  return (
    <span className={badgeClass(tone)}>
      {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />}
      {children}
    </span>
  );
}
