/** Skeleton for admin event pages: keeps the sidebar (rendered by the layout) and reserves a heading, a stat row and a card. */
export default function AdminEventLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded bg-surface" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-[var(--radius-card)] border border-line bg-surface" />)}
      </div>
      <div className="h-64 animate-pulse rounded-[var(--radius-card)] border border-line bg-surface" />
    </div>
  );
}
