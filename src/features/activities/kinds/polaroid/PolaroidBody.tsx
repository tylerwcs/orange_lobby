import { RichSections } from "@/components/portal/RichSections";
import {
  readPolaroidSettings, stickerTray, stickerSources, photoUrl, CameraLauncher, YourPolaroids,
  startPortalPolaroidAction, postPortalPolaroidAction, removeOwnPolaroidAction,
} from "@/features/polaroid";
import type { PolaroidEntry } from "../../lib/portal-activity-entries";

/**
 * A polaroid wall in the portal (D481, D482): the organiser's words, the button that opens the
 * full-screen camera, and the attendee's own polaroids. `openOnArrival` is the card's
 * `?camera=1`. A closed wall never arrives here (D384); the composer shows the server's "Posting
 * is paused" if it closes while the page is open.
 */
export function PolaroidBody({ entry: { activity, mine }, slug, token, brand, openOnArrival }: {
  entry: PolaroidEntry;
  slug: string;
  token: string;
  brand: string;
  openOnArrival: boolean;
}) {
  const settings = readPolaroidSettings(activity.polaroid);
  return (
    <div className="flex flex-col gap-6">
      <RichSections html={activity.description} />
      <CameraLauncher prompt={settings.prompt} stickers={stickerTray(settings)} brand={brand} openOnArrival={openOnArrival}
        start={startPortalPolaroidAction.bind(null, slug, token, activity.id)}
        post={postPortalPolaroidAction.bind(null, slug, token, activity.id)} />
      <YourPolaroids stickerSrc={stickerSources(settings)} remove={removeOwnPolaroidAction.bind(null, slug, token, activity.id)}
        items={mine.map((p) => ({ id: p.id, src: photoUrl(p.photo_path), w: p.photo_w, h: p.photo_h, message: p.message, stickers: p.stickers, tilt: p.tilt }))} />
    </div>
  );
}
