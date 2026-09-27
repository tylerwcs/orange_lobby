import { Skeleton } from "@/components/ui/skeletons";

/** The host console's shape: the header, the facts, and the one big button. */
export default function HostLoading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 p-4" role="status" aria-busy="true" aria-label="Loading the host console">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-36" />
      </div>
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-14 w-full rounded-lg" />
    </main>
  );
}
