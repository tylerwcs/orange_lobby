/**
 * The LED's standard layout: a title on the left, one big fact on the right, the screen's content
 * below. The fact may be a clock (a race's seconds left), so it may differ at hydration.
 */
export function Frame({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col px-16 pb-12 pt-10">
      <header className="flex items-baseline justify-between gap-8">
        <h1 className="truncate text-6xl font-extrabold">{title}</h1>
        {right && <span className="shrink-0 text-6xl font-extrabold tabular-nums text-[var(--brand)]" suppressHydrationWarning>{right}</span>}
      </header>
      <div className="min-h-0 flex-1 pt-8">{children}</div>
    </div>
  );
}
