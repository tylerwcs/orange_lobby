import Link from "next/link";
import { listPassportBooths, listStampsForEvent } from "@/lib/db/booths";
import { listAttendees } from "@/lib/db/attendees";
import { completionByAttendee } from "@/lib/booths";
import { eligible } from "@/lib/activities";
import { appBaseUrl, boothScannerLink } from "@/lib/links";
import { qrDataUrl } from "@/lib/qr";
import type { Activity, Event } from "@/lib/types";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Modal } from "@/components/admin/Modal";
import { Field } from "@/components/admin/Field";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { SaveBar } from "@/components/admin/SaveBar";
import { OpenSwitch } from "@/components/admin/OpenSwitch";
import { ActivityMenu } from "@/components/admin/ActivityMenu";
import { removeWarning } from "@/lib/activity-row";
import { BoothList } from "@/components/admin/BoothList";
import { BoothQr } from "@/components/admin/BoothQr";
import { RichTextEditor, SECTIONS_HINT } from "@/components/admin/RichTextEditor";
import { ImageField } from "@/components/admin/ImageField";
import { COVER_HINT } from "@/components/admin/ActivityRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { buttonVariants } from "@/components/ui/button";
import {
  toggleOpenAction, savePassportActivityAction, deletePassportActivityAction,
  addBoothAction, renameBoothAction, reorderBoothsAction, deleteBoothAction,
  uploadActivityImageAction,
} from "../actions";

const input = "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * A Booth Passport's page: its booths, their scanner links, who has filled the card, and the
 * settings. What used to be the event's Booths page (D190), now one passport's.
 */
export async function PassportDetail({ ev, activity, qr }: { ev: Event; activity: Activity; qr?: string }) {
  const path = `/admin/events/${ev.id}/activities/${activity.id}`;
  const [booths, allStamps, attendees] = await Promise.all([
    listPassportBooths(activity.id), listStampsForEvent(ev.id), listAttendees(ev.id),
  ]);
  const boothIds = new Set(booths.map((b) => b.id));
  const stamps = allStamps.filter((s) => boothIds.has(s.booth_id));
  const counts = stamps.reduce<Record<string, number>>((acc, s) => {
    acc[s.booth_id] = (acc[s.booth_id] ?? 0) + 1;
    return acc;
  }, {});

  // `?qr=<id>` swaps the whole page for one booth's printable sheet: its print stylesheet hides
  // everything else, and a plain route means Back, reload and a direct link all just work.
  const qrBooth = qr ? (booths.find((b) => b.id === qr) ?? null) : null;
  if (qrBooth) {
    const link = boothScannerLink(appBaseUrl(), qrBooth.token);
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex w-full max-w-[559px] items-center justify-between print:hidden">
          <Link href={path} className={buttonVariants({ variant: "outline", size: "sm" })}>← Back to {activity.name}</Link>
        </div>
        <BoothQr boothName={qrBooth.name} location={qrBooth.location} eventName={ev.name} link={link} qr={await qrDataUrl(link)} />
      </div>
    );
  }

  const completion = completionByAttendee(booths, stamps, activity.stamps_required);
  const completed = [...completion.values()].filter((c) => c.complete).length;
  // Out of the people this passport is for, not the whole roster: a VIP-only passport that
  // every VIP has finished is finished (D184).
  const audience = attendees.filter((a) => eligible(activity, a.category)).length;

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader
        title={activity.name}
        subtitle={`${completed} of ${audience} have filled their card · ${booths.length} booth${booths.length === 1 ? "" : "s"}`}
        actions={
          <>
            <OpenSwitch open={activity.is_open} action={toggleOpenAction.bind(null, ev.id, activity.id, "setup")} name={activity.name} showLabel />
            <Modal title="Add a booth" hint="Prints its own scanner link once it exists." trigger="Add booth" icon="plus">
              <form action={addBoothAction.bind(null, ev.id, activity.id)} className="grid gap-4">
                <Field label="Name" name="name" placeholder="Operations" />
                <Field label="Location (optional)" name="location" placeholder="Foyer · Stand 1" />
                <SubmitButton>Add booth</SubmitButton>
              </form>
            </Modal>
            <ActivityMenu
              name={activity.name}
              settingsHref={path}
              exportHref={`/admin/events/${ev.id}/export/passport.xlsx`}
              remove={deletePassportActivityAction.bind(null, ev.id, activity.id)}
              removeMessage={removeWarning({ kind: "passport", booths: booths.length })}
            />
          </>
        }
      />

      {/* No `is_open` field (D127): that column is the header button's alone. Details first,
          then the booths, the same order every kind's Setup keeps (D236). A passport has no
          other tab, so it has no tab strip. */}
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Details and rules</CardTitle></CardHeader>
        <CardContent>
          <form action={savePassportActivityAction.bind(null, ev.id, activity.id)} className="grid grid-cols-1 gap-4">
            <Field label="Name" name="name" defaultValue={activity.name} />
            <RichTextEditor name="description" label="Description (optional)" defaultValue={activity.description} description={SECTIONS_HINT} uploadImage={uploadActivityImageAction.bind(null, ev.id)} />
            <ImageField label="Image (optional)" name="image" url={activity.image_url} description={COVER_HINT} />
            <Field label="Categories (optional)" name="categories" defaultValue={(activity.categories ?? []).join(", ")}
              placeholder="VIP, Management" description="Comma separated. Leave blank for everyone. Booths refuse anyone outside these." />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="stamps_required" className="text-sm font-bold">Stamps needed</label>
              <div className="flex items-center gap-2">
                <input id="stamps_required" name="stamps_required" type="number" min={1} inputMode="numeric"
                  defaultValue={activity.stamps_required ?? ""} placeholder="Every booth" className={`${input} max-w-32 tabular-nums`} />
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">of {booths.length} booth{booths.length === 1 ? "" : "s"}</span>
              </div>
            </div>
            <Field label="Message when the card is full" name="reward_message" defaultValue={activity.reward_message}
              placeholder="Show this screen at the registration counter to collect your gift." />
            <SaveBar inCard />
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Booths</CardTitle></CardHeader>
        <CardContent className="px-0">
          {booths.length === 0 ? (
            <Empty className="border-0 bg-transparent">
              <EmptyHeader>
                <EmptyTitle>No booths yet</EmptyTitle>
                <EmptyDescription>Add the first one to get a scanner link you can print. The booth needs no login.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="px-4">
              <BoothList
                items={booths}
                counts={counts}
                reorder={reorderBoothsAction.bind(null, ev.id, activity.id)}
                renameBooth={renameBoothAction.bind(null, ev.id, activity.id)}
                deleteBooth={deleteBoothAction.bind(null, ev.id, activity.id)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        A booth can be deleted freely until it takes its first stamp. After that, deleting it would quietly take
        those stamps back and drop attendees out of &ldquo;completed&rdquo;, so Delete is disabled instead. Rename the
        booth, or lower <strong className="font-bold text-foreground">Stamps needed</strong> if it drops out mid-event.
      </p>
    </div>
  );
}
