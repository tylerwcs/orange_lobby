import { Flag } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** An expired or not-yet-live host or display link says so, like the crew link does. */
export function LinkRefused({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-6">
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Flag /></EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{body}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}
