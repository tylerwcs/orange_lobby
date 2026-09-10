export function meterPercent(value: number, max: number): number {
  if (!(max > 0)) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

// ARIA requires max > min, so an empty event (max === 0, or negative) must not emit
// aria-valuemax={0}.
export function meterAriaMax(max: number): number {
  return Math.max(1, max);
}

// aria-valuenow clamped into [0, valueMax] to match the visual fill, which meterPercent
// already clamps against the same bound.
export function meterAriaValue(value: number, max: number): number {
  const valueMax = meterAriaMax(max);
  return Math.min(valueMax, Math.max(0, value));
}

export function Meter({ value, max, tone = "ok", label }: { value: number; max: number; tone?: "ok" | "brand"; label: string }) {
  const pct = meterPercent(value, max);
  const fill = tone === "ok" ? "bg-ok-strong" : "bg-brand";
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={meterAriaValue(value, max)} aria-valuemin={0} aria-valuemax={meterAriaMax(max)}
      className="h-2 overflow-hidden rounded-full bg-tint-slate">
      <div className={`h-2 rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
