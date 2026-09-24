import type { IconName } from "@/components/ui/icon";
import type { Tile, TileRoute } from "@/lib/modules";
import type { ActivityNav } from "@/lib/portal-activities";

/**
 * One round button on the portal home. `builtin` marks the sections the desktop header
 * already links to, so the desktop dashboard can leave them out (D210).
 */
export type LauncherItem = {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  image: string | null;
  external: boolean;
  dot: boolean;
  builtin: boolean;
};

/**
 * What the home's launcher shows, in order: the portal's own sections, then the organiser's
 * tiles (D211). On a phone this is the whole navigation - the bottom bar is gone (D209). Agenda
 * always; Info beside it when there is an info section (D216 - they were one slot before);
 * Activities only for somebody who can see one, dotted while a pick is owed; Me on the
 * personal portal only.
 *
 * A route tile that opens a section already on the launcher is dropped rather than drawn
 * twice. One whose section is not on screen - Activities for somebody who cannot see any,
 * Me on the public portal - stays, since the organiser put it there on purpose.
 */
export function launcherItems(input: {
  basePath: string;
  personal: boolean;
  hasInfo: boolean;
  activities?: ActivityNav;
  tiles: Tile[];
}): LauncherItem[] {
  const { basePath, personal, hasInfo, activities, tiles } = input;
  const section = (key: string, label: string, path: string, icon: IconName, dot = false): LauncherItem => ({
    id: `builtin:${key}`, label, href: `${basePath}${path}`, icon, image: null, external: false, dot, builtin: true,
  });

  const showActivities = personal && Boolean(activities?.show);
  const items: LauncherItem[] = [
    section("agenda", "Agenda", "/agenda", "calendar"),
    ...(hasInfo ? [section("info", "Info", "/info", "info")] : []),
    ...(showActivities ? [section("activities", "Activities", "/activities", "ticket", Boolean(activities?.owed))] : []),
    ...(personal ? [section("me", "Me", "/me", "user")] : []),
  ];

  const covered = new Set<TileRoute>(["agenda"]);
  if (hasInfo) covered.add("info");
  if (showActivities) covered.add("activities");
  if (personal) covered.add("me");

  for (const t of tiles) {
    if (t.route && covered.has(t.route)) continue;
    items.push({ id: t.id, label: t.label, href: t.href, icon: t.icon, image: t.image, external: t.external, dot: false, builtin: false });
  }
  return items;
}
