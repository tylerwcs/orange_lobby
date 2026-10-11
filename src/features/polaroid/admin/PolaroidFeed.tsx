import Link from "next/link";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { ConfirmButton } from "@/components/admin/ConfirmButton";
import { listAttendeesByIds } from "@/lib/db/attendees";
import { scannerNames } from "@/lib/db/users";
import { shortDateTime } from "@/lib/text";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import type { Activity, Event } from "@/lib/types";
import { photoUrl, polaroidsForAdmin } from "../db/polaroids";
import { readPolaroidSettings } from "../lib/settings";
import { stickerSources } from "../lib/stickers";
import { PolaroidCard } from "../components/PolaroidCard";
import { removePolaroidAction } from "./actions";

/** D485: every post as it looks on the wall, newest first, refreshing while crew watch it. */
export async function PolaroidFeed({ ev, activity, show }: { ev: Event; activity: Activity; show?: string }) {
  const rows = await polaroidsForAdmin(activity.id);
  const removedView = show === "removed";
  const shown = rows.filter((r) => (removedView ? r.status === "removed" : r.status === "live"));
  const live = rows.filter((r) => r.status === "live").length;
  const people = new Map((await listAttendeesByIds(ev.id, [...new Set(shown.flatMap((r) => (r.attendee_id ? [r.attendee_id] : [])))])).map((a) => [a.id, a.name]));
  // scannerNames answers with a plain record (user id to email), not a Map.
  const removers = await scannerNames(shown.flatMap((r) => (r.removed_by?.startsWith("admin:") ? [r.removed_by.slice(6)] : [])));
  const src = stickerSources(readPolaroidSettings(activity.polaroid));
  const base = `/admin/events/${ev.id}/activities/${activity.id}?tab=polaroids`;
  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={5} />
      <nav className="flex gap-2 text-sm">
        <Link href={base} aria-current={!removedView ? "page" : undefined} className={!removedView ? "font-bold" : "text-muted-foreground"}>Live {live}</Link>
        <span className="text-muted-foreground">·</span>
        <Link href={`${base}&show=removed`} aria-current={removedView ? "page" : undefined} className={removedView ? "font-bold" : "text-muted-foreground"}>Removed {rows.length - live}</Link>
      </nav>
      {shown.length === 0 ? (
        <Empty className="border-0 bg-transparent">
          <EmptyHeader>
            <EmptyTitle>{removedView ? "Nothing removed" : "Nothing on the wall yet"}</EmptyTitle>
            <EmptyDescription>{removedView ? "Polaroids you take down show here." : "New polaroids appear here within a few seconds of being posted."}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6">
          {shown.map((r) => {
            const who = r.attendee_id ? people.get(r.attendee_id) ?? "Removed attendee" : "Walk-in";
            const by = r.removed_by === "self" ? "the poster" : r.removed_by ? removers[r.removed_by.slice(6)] ?? "an admin" : null;
            return (
              <div key={r.id} className="flex flex-col items-center gap-2 pt-3">
                <PolaroidCard width={180} stickerSrc={src} loading="lazy" className={r.status === "removed" ? "opacity-50 grayscale" : ""}
                  card={{ src: r.status === "live" ? photoUrl(r.photo_path) : null, w: r.photo_w, h: r.photo_h, message: r.message, stickers: r.stickers, tilt: r.tilt }} />
                <div className="w-full text-center text-xs">
                  <div className="font-bold">{who}</div>
                  <div className="text-muted-foreground">{shortDateTime(r.created_at)}</div>
                  {r.status === "removed" && <div className="text-muted-foreground">Removed by {by}{r.removed_at ? ` · ${shortDateTime(r.removed_at)}` : ""}</div>}
                </div>
                {r.status === "live" && (
                  <form action={removePolaroidAction.bind(null, ev.id, activity.id, r.id)}>
                    <ConfirmButton message="It leaves the wall within a few seconds and the photo is deleted. This can't be undone." confirmLabel="Remove">Remove from wall</ConfirmButton>
                  </form>
                )}
                {r.status === "removed" && (
                  <form action={removePolaroidAction.bind(null, ev.id, activity.id, r.id)}>
                    <ConfirmButton message="Tries again to delete the photo file. Use it if the photo was still reachable after the polaroid was taken down." confirmLabel="Delete photo">Delete photo again</ConfirmButton>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
