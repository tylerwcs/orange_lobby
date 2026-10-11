import "server-only";
import { createHash } from "node:crypto";
import { createMemo } from "@/lib/memo";
import { qrDataUrl } from "@/lib/qr";
import { polaroidWalkinLink } from "@/lib/links";
import { eventAddress } from "@/features/domains";
import type { Activity, Event } from "@/lib/types";
import { livePolaroids, photoUrl } from "./db/polaroids";
import { readPolaroidSettings } from "./lib/settings";
import { stickerSources } from "./lib/stickers";
import type { WallState } from "./lib/wire";

const stateMemo = createMemo<Omit<WallState, "now">>(1000);
const qrMemo = createMemo<string>(10 * 60_000);

/** D484: the whole wall in one answer, memoised for a second per instance. */
export async function wallState(activity: Activity, event: Pick<Event, "id" | "slug" | "primary_color">): Promise<WallState> {
  const body = await stateMemo.get(activity.id, async () => {
    const settings = readPolaroidSettings(activity.polaroid);
    const rows = await livePolaroids(activity.id);
    const link = settings.public && activity.public_token ? polaroidWalkinLink(await eventAddress(event), activity.public_token) : null;
    const core = {
      cards: rows.map((r) => ({ id: r.id, src: photoUrl(r.photo_path), w: r.photo_w, h: r.photo_h, message: r.message, stickers: r.stickers, tilt: r.tilt, created_at: r.created_at })),
      stickerSrc: stickerSources(settings),
      columns: settings.columns,
      speed: settings.speed,
      background: settings.background,
      brand: event.primary_color,
      qr: link ? await qrMemo.get(link, () => qrDataUrl(link)) : null,
      open: activity.is_open,
    };
    return { ...core, key: createHash("sha1").update(JSON.stringify(core)).digest("base64url").slice(0, 16) };
  });
  return { now: Date.now(), ...body };
}
