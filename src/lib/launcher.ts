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

/** The launcher sections an organiser may give their own picture (D222). */
export const ICON_SECTIONS = ["agenda", "info"] as const;
export type IconSection = (typeof ICON_SECTIONS)[number];
export type SectionIcons = Record<IconSection, string | null>;

/** The portal's own illustrations, drawn when the organiser has not set one (D221). */
export const DEFAULT_SECTION_ICONS: Record<IconSection, string> = {
  agenda: "/portal-icons/agenda.webp",
  info: "/portal-icons/info.webp",
};

const SAFE_URL = /^https?:\/\//i;

/**
 * `events.section_icons` as the launcher reads it: each section's uploaded picture, or null for
 * the default. The column is jsonb an admin action writes, but it is read defensively all the
 * same - a non-http(s) value is dropped here, never handed to an <img>.
 */
export function sectionIcons(raw: unknown): SectionIcons {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pick = (k: IconSection) => {
    const v = obj[k];
    return typeof v === "string" && SAFE_URL.test(v) ? v : null;
  };
  return { agenda: pick("agenda"), info: pick("info") };
}

/**
 * What the home's launcher shows, in order: the portal's own sections, then the organiser's
 * tiles (D211). On a phone this is the whole navigation - the bottom bar is gone (D209). Agenda
 * always; Info beside it when there is an info section (D216 - they were one slot before).
 * Both are drawn with the portal's own pictures (D221), unless the organiser has set one
 * (D222). Me is not here: it is the button in the home header's top right corner (D236).
 *
 * No Activities button (D221): for anybody who can see one, the activity cards sit on the home
 * page under the launcher, with "See all" to the page, and the card owed a pick leads them.
 *
 * A route tile that repeats a button already in this row - Agenda, or Info when it is shown -
 * is dropped rather than drawn twice. Every other tile stays, Activities and Me included: they
 * have no button here, and an organiser who adds one is asking for it (D237).
 */
export function launcherItems(input: {
  basePath: string;
  /** Kept for the callers' sake; the row is the same on both portals since Me left it (D236). */
  personal: boolean;
  hasInfo: boolean;
  /** No longer read here: Activities has no button of its own in the row (D221, D237). */
  activities?: ActivityNav;
  tiles: Tile[];
  icons?: SectionIcons;
}): LauncherItem[] {
  const { basePath, hasInfo, tiles, icons } = input;
  const section = (key: string, label: string, path: string, icon: IconName, image: string | null = null): LauncherItem => ({
    id: `builtin:${key}`, label, href: `${basePath}${path}`, icon, image, external: false, dot: false, builtin: true,
  });

  const items: LauncherItem[] = [
    section("agenda", "Agenda", "/agenda", "calendar", icons?.agenda ?? DEFAULT_SECTION_ICONS.agenda),
    ...(hasInfo ? [section("info", "Info", "/info", "info", icons?.info ?? DEFAULT_SECTION_ICONS.info)] : []),
  ];

  const covered = new Set<TileRoute>(["agenda"]);
  if (hasInfo) covered.add("info");

  for (const t of tiles) {
    if (t.route && covered.has(t.route)) continue;
    items.push({ id: t.id, label: t.label, href: t.href, icon: t.icon, image: t.image, external: t.external, dot: false, builtin: false });
  }
  return items;
}
