/**
 * Loading placeholders for Next's `loading.tsx` boundaries.
 *
 * The shimmer is `--line`, not `--surface`: a white block pulsing on the near-white
 * canvas is invisible, which is how the old skeletons managed to look like nothing was
 * happening. `globals.css` already collapses animation under `prefers-reduced-motion`,
 * so the blocks simply hold still there rather than needing their own guard.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-[var(--radius-control)] bg-line ${className}`} />;
}

/** A card-shaped placeholder that matches the real card's elevation, so the page does not jump. */
export function SkeletonCard({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div aria-hidden="true" className={`rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)] ${className}`}>
      {children}
    </div>
  );
}

/** Rows of a table placeholder: one taller header line, then evenly weighted rows. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-3 w-40" />
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
    </div>
  );
}
