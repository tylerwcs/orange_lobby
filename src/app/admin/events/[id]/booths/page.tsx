import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { requireEvent } from "@/lib/db/events";
import { listBooths, listStampsForEvent } from "@/lib/db/booths";
import { countAttendees } from "@/lib/db/attendees";
import { completionByAttendee } from "@/lib/booths";
import { appBaseUrl, boothScannerLink } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { BoothList } from "@/components/admin/BoothList";
import { BoothQr } from "@/components/admin/BoothQr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { buttonVariants } from "@/components/ui/button";
import { addBoothAction, renameBoothAction, reorderBoothsAction, deleteBoothAction, savePassportAction } from "./actions";

export const metadata = { title: "Booths · Orange Lobby" };

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function Booths({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ qr?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { orgId } = await requireAdmin();
  const ev = await requireEvent(id, orgId);
  const [booths, stamps, totalAttendees] = await Promise.all([
    listBooths(ev.id), listStampsForEvent(ev.id), countAttendees(ev.id),
  ]);
  // Counts per booth, derived from the same list `completionByAttendee` reads below —
  // calling `countStampsByBooth` too would run the identical query against booth_stamps
  // a second time for numbers already sitting in `stamps`.
  const counts = stamps.reduce<Record<string, number>>((acc, s) => {
    acc[s.booth_id] = (acc[s.booth_id] ?? 0) + 1;
    return acc;
  }, {});

  // `?qr=<id>` swaps the whole page for one booth's printable sheet, rather than opening it
  // as a panel over the list: the sheet's own print stylesheet hides everything else in the
  // document (including the sidebar), so there is nothing to gain from keeping the list
  // mounted beside it, and a plain route means Back, reload and a direct link all just work.
  const qrBooth = sp.qr ? (booths.find((b) => b.id === sp.qr) ?? null) : null;
  if (qrBooth) {
    const link = boothScannerLink(appBaseUrl(), qrBooth.token);
    const qr = await qrDataUrl(link);
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex w-full max-w-[559px] items-center justify-between print:hidden">
          <Link href={`/admin/events/${ev.id}/booths`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            ← Back to booths
          </Link>
        </div>
        <BoothQr boothName={qrBooth.name} location={qrBooth.location} eventName={ev.name} link={link} qr={qr} />
      </div>
    );
  }

  const completion = completionByAttendee(booths, stamps, ev.stamps_required);
  const completedCount = [...completion.values()].filter((c) => c.complete).length;

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title="Booths"
        subtitle="A booth stamps the passport. Each one gets its own scanner link — print it and hand it over; the booth needs no login."
        actions={
          <Modal title="Add a booth" hint="Prints its own scanner link once it exists." trigger="Add booth" icon="plus">
            <form action={addBoothAction.bind(null, ev.id)} className="grid gap-4">
              <Field label="Name" name="name" placeholder="Operations" />
              <Field label="Location (optional)" name="location" placeholder="Foyer · Stand 1" />
              <SubmitButton>Add booth</SubmitButton>
            </form>
          </Modal>
        }
      />

      {/* The target and the reward wording are the two things nobody knows until the week
          of the event. Both live here; neither is a deploy. */}
      <Card>
        <CardHeader>
          <CardTitle>Passport</CardTitle>
          <CardDescription>
            <strong className="font-extrabold text-foreground tabular-nums">{completedCount}</strong> of {totalAttendees} have filled their card.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={savePassportAction.bind(null, ev.id)} className="grid gap-4 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)_auto] sm:items-end">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="stamps_required" className="text-sm font-bold">Stamps needed</label>
              <div className="flex items-center gap-2">
                <input
                  id="stamps_required" name="stamps_required" type="number" min={1} inputMode="numeric"
                  defaultValue={ev.stamps_required ?? ""} placeholder="Every booth" className={`${input} tabular-nums`}
                />
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">of {booths.length} booth{booths.length === 1 ? "" : "s"}</span>
              </div>
            </div>
            <Field label="Message when the card is full" name="stamps_message" defaultValue={ev.stamps_message} placeholder="Show this screen at the registration counter to collect your gift." />
            <SubmitButton variant="outline">Save</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle>Booths</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {booths.length === 0 ? (
            <Empty className="border-0 bg-transparent">
              <EmptyHeader>
                <EmptyTitle>No booths yet</EmptyTitle>
                <EmptyDescription>Add the first one to get a scanner link you can print.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="px-6">
              <BoothList
                items={booths}
                counts={counts}
                reorder={reorderBoothsAction.bind(null, ev.id)}
                renameBooth={renameBoothAction.bind(null, ev.id)}
                deleteBooth={deleteBoothAction.bind(null, ev.id)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        A booth can be deleted freely until it takes its first stamp. After that, deleting it would quietly take
        those stamps back and drop attendees out of &ldquo;completed&rdquo;, so Delete is disabled instead of
        doing that silently. Rename the booth, or lower{" "}
        <strong className="font-bold text-foreground">Stamps needed</strong> if it drops out mid-event.
      </p>
    </div>
  );
}
