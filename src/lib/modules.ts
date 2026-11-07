import { z } from "zod";
import { categoryMatches } from "@/lib/agenda";
import type { Event } from "@/lib/types";
import type { IconName } from "@/components/ui/icon";

/**
 * The keys a stored module row may carry. This list can gain entries but must not lose
 * them: `events.modules` is a jsonb column and `builtinSchema` validates against this enum,
 * so dropping a key makes every event that still has a row for it fail to parse - the
 * portal would 500 rather than ignore it.
 *
 * None of them renders any more: each became a launcher section, the banner, the badge card or
 * (the floor plan, D839) a tab on the Info page. A stored row for one still parses and is
 * simply dropped (normalizeModules, resolveTiles).
 */
export const BUILTIN_MODULES = ["agenda", "seat", "floor_plan", "info", "announcements"] as const;
export type BuiltinKey = (typeof BUILTIN_MODULES)[number];

export const MODULE_ICONS = ["calendar", "seat", "map", "info", "megaphone", "mic", "file", "chat", "check", "phone", "link", "star", "users", "download"] as const satisfies readonly IconName[];
export type ModuleIcon = (typeof MODULE_ICONS)[number];

/**
 * Internal portal destinations a tile may point at. Like BUILTIN_MODULES this list is
 * validated against stored jsonb, so it may gain entries but must not lose them.
 */
export const TILE_ROUTES = ["agenda", "announcements", "info", "me", "seat", "stamps", "activities", "play", "qualifier"] as const;
export type TileRoute = (typeof TILE_ROUTES)[number];

/**
 * The routes the tile editor offers. `qualifier` is kept in TILE_ROUTES for tiles already saved
 * with it (its page now forwards to Games, where Slime Splat lives, D797), but a new tile points
 * at Games.
 */
export const PICKABLE_TILE_ROUTES: readonly TileRoute[] = TILE_ROUTES.filter((r) => r !== "qualifier");

/**
 * Routes that only exist on a personal link. Playing needs an identity (D253), so the public
 * portal has no play page and a Games tile is left off its home rather than drawn as a 404.
 */
const PERSONAL_ONLY_ROUTES: ReadonlySet<TileRoute> = new Set<TileRoute>(["play", "qualifier"]);

/**
 * The human label for each route, shown in the tile editor's "Portal page" picker instead
 * of the raw slug. Typed as `Record<TileRoute, string>` so adding a route to TILE_ROUTES
 * without adding its label here is a type error, not a silently blank option.
 */
export const TILE_ROUTE_LABELS: Record<TileRoute, string> = {
  agenda: "Agenda",
  announcements: "Announcements",
  info: "Info page",
  me: "My badge",
  seat: "My seat",
  stamps: "Booth Passport",
  activities: "Activities",
  play: "Games",
  qualifier: "Slime Splat (in Games)",
};

export type TileTarget = { kind: "url"; url: string } | { kind: "route"; route: TileRoute };

/**
 * `url` was the retired floor plan tile's image; it stays in the type so old rows parse.
 */
/**
 * `icon_image` is an uploaded picture drawn in the launcher's circle in place of the preset
 * icon (D213). The preset stays required: it is what shows when there is no picture.
 */
/** `categories`: who sees the tile on the portal home, as on agenda rows (categoryMatches); absent for everyone. */
export type BuiltinModule = { key: BuiltinKey; enabled: boolean; label?: string; subtitle?: string; url?: string; icon_image?: string; categories?: string[] };
export type LinkModule = { key: "link"; id: string; enabled: boolean; label: string; subtitle?: string; url: string; icon: ModuleIcon; categories?: string[] };
/** An admin-authored tile. Replaces the four fixed `link` slots. */
export type TileModule = { key: "tile"; id: string; enabled: boolean; label: string; subtitle?: string; icon: ModuleIcon; icon_image?: string; target: TileTarget; categories?: string[] };
export type EventModule = BuiltinModule | LinkModule | TileModule;

const SAFE_URL = /^https?:\/\//i;
const iconImage = z.string().regex(SAFE_URL, "icon_image must start with http:// or https://").optional();
const categories = z.array(z.string().trim().min(1).max(60)).max(30).optional();
const builtinSchema = z.object({ key: z.enum(BUILTIN_MODULES), enabled: z.boolean(), label: z.string().min(1).max(40).optional(), subtitle: z.string().max(60).optional(), url: z.string().regex(SAFE_URL, "url must start with http:// or https://").optional(), icon_image: iconImage, categories });
const linkSchema = z.object({
  key: z.literal("link"), id: z.string().regex(/^[a-z0-9_-]{1,32}$/), enabled: z.boolean(),
  label: z.string().min(1).max(40), subtitle: z.string().max(60).optional(),
  url: z.string().regex(SAFE_URL, "url must start with http:// or https://"), icon: z.enum(MODULE_ICONS), categories,
});
const targetSchema = z.union([
  z.object({ kind: z.literal("url"), url: z.string().regex(SAFE_URL, "url must start with http:// or https://") }),
  z.object({ kind: z.literal("route"), route: z.enum(TILE_ROUTES) }),
]);
const tileSchema = z.object({
  key: z.literal("tile"), id: z.string().regex(/^[a-z0-9_-]{1,32}$/), enabled: z.boolean(),
  label: z.string().min(1).max(40), subtitle: z.string().max(60).optional(),
  icon: z.enum(MODULE_ICONS), icon_image: iconImage, target: targetSchema, categories,
});
const moduleSchema = z.union([builtinSchema, linkSchema, tileSchema]);

// z.union reports a mismatched item as one `invalid_union` issue holding one
// issue-list per branch (relative to that branch, so no leading array index).
// Walk down to the branch that most likely matches the author's intent — the
// one everyone agrees isn't merely a `key` literal mismatch, picking the
// shortest of those — so the thrown message names the field that actually
// needs fixing (e.g. "key" for an unrecognised key, "url" for a bad url).
function flattenIssue(issue: z.core.$ZodIssue): z.core.$ZodIssue {
  if (issue.code === "invalid_union") {
    const branches = issue.errors;
    const isKeyOnly = (b: z.core.$ZodIssue[]) => b.length === 1 && String(b[0].path[b[0].path.length - 1]) === "key";
    if (branches.every(isKeyOnly)) return branches[0][0];
    const candidates = branches.filter((b) => !isKeyOnly(b));
    const chosen = (candidates.length ? candidates : branches).slice().sort((a, b) => a.length - b.length)[0];
    return flattenIssue(chosen[0]);
  }
  return issue;
}

export function parseModules(input: string | unknown): EventModule[] {
  let raw: unknown = input;
  if (typeof input === "string") {
    try { raw = JSON.parse(input); } catch { throw new Error("Modules must be valid JSON"); }
  }
  const res = z.array(moduleSchema).max(12).safeParse(raw);
  if (!res.success) {
    const top = res.error.issues[0];
    const leaf = flattenIssue(top);
    const field = String(leaf.path[leaf.path.length - 1] ?? "key");
    throw new Error(`Module ${String(top.path[0] ?? "?")}: ${field} — ${leaf.message}`);
  }
  return res.data as EventModule[];
}

/**
 * The stored modules as the editor and the portal should see them: legacy `link` rows
 * become `tile` rows and retired built-ins (all of them, the floor plan last, D839) are
 * dropped.
 *
 * This is why the tiles rework needs no data migration. `events.modules` is jsonb, so the
 * old shapes keep parsing and are converted on read; the first save an admin makes writes
 * the new shape back. Rewriting every live row in SQL would buy nothing and would have to
 * be correct on the first attempt against production data.
 */
export function normalizeModules(event: Pick<Event, "modules">): EventModule[] {
  const stored = event.modules ?? [];
  const out: EventModule[] = [];
  for (const m of stored) {
    if (m.key === "link") {
      out.push({ key: "tile", id: m.id, enabled: m.enabled, label: m.label, ...(m.subtitle ? { subtitle: m.subtitle } : {}), icon: m.icon, target: { kind: "url", url: m.url } });
      continue;
    }
    if (m.key === "tile") out.push(m);
  }
  return out;
}

/**
 * `image` is the uploaded icon, null when the preset `icon` is drawn. `route` names the
 * portal page a route tile opens (null for links), so the launcher can
 * drop a tile that repeats one of its own sections (D211).
 */
export type Tile = { id: string; label: string; subtitle: string; href: string; icon: ModuleIcon; image: string | null; route: TileRoute | null; external: boolean };

/** Re-checked at render for the same reason as a tile's url: a stored row may predate the rule. */
const safeImage = (url: string | undefined): string | null => (url && SAFE_URL.test(url) ? url : null);

/**
 * D489: the portal's own picture for a tile with no upload, by its preset icon. Download is the
 * post-event materials folder, drawn like the launcher's other pictures and tinted with them
 * (D488). An icon without a picture here stays the plain icon in the accent circle.
 */
export const ICON_ART: Partial<Record<ModuleIcon, string>> = { download: "/portal-icons/post-event.webp" };
const tileImage = (m: { icon_image?: string; icon: ModuleIcon }) => safeImage(m.icon_image) ?? ICON_ART[m.icon] ?? null;

/**
 * `personal`, `attendee`, `next` and `latestAnnouncement` used to be inputs here: they
 * filled the subtitles of the agenda, seat and announcement tiles. Those tiles are gone,
 * and with them the only reason this function needed to know anything about who is looking
 * or what is happening. It depended on the event and the path alone until tiles gained
 * categories: `category` is the viewer's (null on the public portal), and a tile for other
 * programmes is left off their home (categoryMatches, as on agenda rows). `personal` is false on
 * the public portal, which drops a tile for a page only a personal link has (the Games tile).
 */
export function resolveTiles(input: {
  event: Pick<Event, "modules">;
  basePath: string;
  category?: string | null;
  personal?: boolean;
}): Tile[] {
  const { event, basePath, category = null, personal = true } = input;
  const modules = event.modules ?? [];
  const out: Tile[] = [];
  for (const m of modules) {
    if (!m.enabled) continue;
    if (!categoryMatches(m.categories ?? null, category)) continue;
    if (m.key === "tile") {
      if (m.target.kind === "url") {
        // Re-checked here as well as in parseModules: a row written before this rule, or
        // edited around it, must never render as a javascript:/data: tile.
        if (!SAFE_URL.test(m.target.url)) continue;
        out.push({ id: `tile:${m.id}`, label: m.label, subtitle: m.subtitle ?? "", href: m.target.url, icon: m.icon, image: tileImage(m), route: null, external: true });
        continue;
      }
      if (!personal && PERSONAL_ONLY_ROUTES.has(m.target.route)) continue;
      out.push({ id: `tile:${m.id}`, label: m.label, subtitle: m.subtitle ?? "", href: `${basePath}/${m.target.route}`, icon: m.icon, image: tileImage(m), route: m.target.route, external: false });
      continue;
    }
    if (m.key === "link") {
      if (!SAFE_URL.test(m.url)) continue;
      out.push({ id: `link:${m.id}`, label: m.label, subtitle: m.subtitle ?? "", href: m.url, icon: m.icon, image: null, route: null, external: true });
    }
    // A row for a retired built-in parses but draws nothing.
  }
  return out;
}
