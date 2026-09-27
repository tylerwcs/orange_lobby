/** The LED goes black at once while the first view loads, rather than flashing a light skeleton on a stage screen. */
export default function DisplayLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black" role="status" aria-busy="true" aria-label="Loading the display">
      <div className="size-16 animate-pulse rounded-full bg-white/10" />
    </div>
  );
}
