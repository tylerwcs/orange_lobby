import { Skeleton as Base } from "@/components/ui/skeleton";
import { cn } from "cn";

/**
 * Loading placeholders for Next's `loading.tsx` boundaries.
 *
 * The shimmer is `--border`, not shadcn's default `bg-muted`. `--muted` (#F1F2F4) against
 * `--background` (#F5F5F3) is about 1.02:1 - a block that is there but cannot be seen,
 * which is exactly how this app's skeletons looked before someone fixed it. Stock
 * skeleton.tsx is untouched; the colour is chosen here, where the page-level placeholders
 * are composed.
 *
 * `globals.css` already collapses animation under `prefers-reduced-motion`, so the blocks
 * simply hold still there rather than needing their own guard.
 */
export function Skeleton({ className }: { className?: string }) {
  return <Base aria-hidden="true" className={cn("bg-border", className)} />;
}

/** A card-shaped placeholder that matches the real card, so the page does not jump. */
export function SkeletonCard({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div aria-hidden="true" className={cn("rounded-xl bg-card p-5 ring-1 ring-foreground/10", className)}>
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
