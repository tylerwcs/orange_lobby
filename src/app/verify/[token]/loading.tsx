import { Skeleton } from "@/components/ui/skeleton";

/** The verify page's shape while its entries load: the header, the filters, a few cards. */
export default function VerifyLoading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-6" aria-busy="true">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-11 w-full" />
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
    </main>
  );
}
