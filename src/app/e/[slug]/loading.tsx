/** Route-level skeleton for the attendee portal: reserves the header, one card and a tile grid so nothing jumps when data lands. */
export default function PortalLoading() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-canvas" aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-4">
        <div className="h-10 w-10 animate-pulse rounded-[10px] bg-canvas" />
        <div className="flex-1 space-y-2"><div className="h-4 w-2/3 animate-pulse rounded bg-canvas" /><div className="h-3 w-1/2 animate-pulse rounded bg-canvas" /></div>
      </div>
      <div className="flex flex-col gap-3.5 px-4 pt-4">
        <div className="h-20 animate-pulse rounded-[var(--radius-card)] bg-surface" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[108px] animate-pulse rounded-[var(--radius-card)] border border-line bg-surface" />)}
        </div>
      </div>
    </div>
  );
}
