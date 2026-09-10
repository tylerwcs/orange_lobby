export function meterPercent(value: number, max: number): number {
  if (!(max > 0)) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

export function Meter({ value, max, tone = "ok", label }: { value: number; max: number; tone?: "ok" | "brand"; label: string }) {
  const pct = meterPercent(value, max);
  const fill = tone === "ok" ? "bg-ok-strong" : "bg-brand";
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}
      className="h-2 overflow-hidden rounded-full bg-tint-slate">
      <div className={`h-2 rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
