/** A draining ring with the seconds left in the middle (D303, D306). `left` and `total` are seconds. */
export function TimerRing({ left, total, size = 150 }: { left: number; total: number; size?: number }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  const f = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.18)" strokeWidth={14} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--brand)" strokeWidth={14} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - f)} style={{ transition: "stroke-dashoffset 250ms linear" }} suppressHydrationWarning />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-game text-6xl tabular-nums text-white" suppressHydrationWarning>
        {Math.ceil(left)}
      </span>
    </div>
  );
}
