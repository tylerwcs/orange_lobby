/** The LED goes dark at once while the wall loads, rather than flashing a light skeleton on a stage screen. */
export default function WallLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#0d0d10]" role="status" aria-busy="true" aria-label="Loading the wall">
      <div className="size-16 animate-pulse rounded-full bg-white/10" />
    </div>
  );
}
