import type { MetadataRoute } from "next";
import type { Event } from "@/lib/types";

/** Room under a home-screen icon: about 12 characters before the phone cuts it off. */
const SHORT_NAME = 15;

/**
 * The label under the icon: the event's name, cut back to whole words when it is long.
 * "Ecopia Kick-Off Meeting 2026" becomes "Ecopia Kick-Off".
 */
function shortName(name: string): string {
  if (name.length <= SHORT_NAME) return name;
  let out = "";
  for (const word of name.split(/\s+/)) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > SHORT_NAME) break;
    out = next;
  }
  return out || name.slice(0, SHORT_NAME);
}

/**
 * The web app manifest for one attendee's portal (D227): adding it to the home screen opens
 * *their* page, not the event's front door.
 *
 * Per attendee rather than one `app/manifest.ts`, because the start page is personal - the
 * token in the path is the whole login. `scope` is the same path, so links out of it (a Q&A
 * tile, the map) leave the app window rather than trapping the attendee in it; and `id` pins
 * the installed app to this attendee, so two people on a shared tablet get two apps.
 */
export function attendeeManifest(
  event: Pick<Event, "name" | "primary_color">,
  basePath: string,
): MetadataRoute.Manifest {
  return {
    id: basePath,
    name: event.name,
    short_name: shortName(event.name),
    start_url: basePath,
    scope: basePath,
    display: "standalone",
    background_color: "#f5f5f3",
    theme_color: event.primary_color,
    icons: [
      { src: "/app-icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/app-icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/app-icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
