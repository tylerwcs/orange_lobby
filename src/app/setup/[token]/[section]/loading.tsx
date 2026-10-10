import { Skeleton } from "@/components/ui/skeletons";

/** A setup step's shape: the title row, the field groups, and the phone preview beside them. */
export default function SetupStepLoading() {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_320px]" role="status" aria-busy="true" aria-label="Loading this section">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
      <Skeleton className="hidden h-[620px] w-[300px] rounded-[2.25rem] lg:block" />
    </main>
  );
}
