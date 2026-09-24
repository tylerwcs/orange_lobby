import { loadPortalAttendee, isUnpublished } from "@/lib/portal";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { floorPlanUrl } from "@/lib/modules";
import { fieldValue } from "@/lib/attendee-values";

export default async function Seat({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const { event, attendee } = await loadPortalAttendee(slug, token);
  // A draft shows only "Coming soon" (the layout's chrome); see isUnpublished.
  if (isUnpublished(event)) return null;
  const basePath = `/e/${slug}/a/${token}`;
  const table = fieldValue(attendee, "table_no");
  return (
    <>
      <h1 className="mb-3 text-xl font-extrabold">My seat</h1>
      {table ? (
        <div className="mb-4 rounded-[14px] bg-foreground p-6 text-center text-white">
          <div className="text-xs font-bold uppercase tracking-[0.08em] text-gray-300">Table</div>
          <div className="text-6xl font-extrabold text-primary">{table}</div>
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">Your seat will be shown here once seating is confirmed.</p>
      )}
      {floorPlanUrl(event) && (
        <Link href={`${basePath}/plan`} className={buttonVariants({ variant: "outline" })}>Open floor plan</Link>
      )}
    </>
  );
}
