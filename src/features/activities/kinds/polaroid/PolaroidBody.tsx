import {
  readPolaroidSettings, stickerTray, stickerSources, photoUrl, PortalCamera,
  startPortalPolaroidAction, postPortalPolaroidAction, removeOwnPolaroidAction,
} from "@/features/polaroid";
import type { PolaroidEntry } from "../../lib/portal-activity-entries";

/**
 * A polaroid wall in the portal (D481, D482): the whole page is the full-screen camera. Its ×
 * goes back to the attendee's home; its corner button opens "Your polaroids", with the organiser's
 * words and the attendee's own polaroids. A closed wall never arrives here (D384); the composer
 * shows the server's "Posting is paused" if it closes while the page is open.
 */
export function PolaroidBody({ entry: { activity, mine }, slug, token, brand }: {
  entry: PolaroidEntry;
  slug: string;
  token: string;
  brand: string;
}) {
  const settings = readPolaroidSettings(activity.polaroid);
  return (
    <PortalCamera prompt={settings.prompt} stickers={stickerTray(settings)} brand={brand}
      start={startPortalPolaroidAction.bind(null, slug, token, activity.id)}
      post={postPortalPolaroidAction.bind(null, slug, token, activity.id)}
      homePath={`/e/${slug}/a/${token}`} about={activity.description}
      stickerSrc={stickerSources(settings)} remove={removeOwnPolaroidAction.bind(null, slug, token, activity.id)}
      items={mine.map((p) => ({ id: p.id, src: photoUrl(p.photo_path), w: p.photo_w, h: p.photo_h, message: p.message, stickers: p.stickers, tilt: p.tilt }))} />
  );
}
