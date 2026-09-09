/** Skeleton for the scanner: reserves the camera area so the page does not jump when it mounts. */
export default function ScanLoading() {
  return (
    <main className="mx-auto max-w-md p-3" aria-busy="true" aria-label="Loading scanner">
      <div className="mb-3 flex items-center justify-between"><div className="h-6 w-24 animate-pulse rounded bg-surface" /><div className="h-8 w-24 animate-pulse rounded-full bg-surface" /></div>
      <div className="min-h-[240px] animate-pulse rounded-[var(--radius-card)] bg-ink/80" />
      <div className="mt-3 h-16 animate-pulse rounded-[var(--radius-card)] border border-line bg-surface" />
    </main>
  );
}
