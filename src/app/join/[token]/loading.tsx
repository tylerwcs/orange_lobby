import { Skeleton } from "@/components/ui/skeleton";

/** The join card's shape while the link is checked: the mark, a title, two fields, a button. */
export default function JoinLoading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm items-center p-6" aria-busy="true">
      <div className="flex w-full flex-col gap-4 rounded-xl border p-6">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    </main>
  );
}
