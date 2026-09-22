import { z } from "zod";
import type { Event } from "@/lib/types";
import type { IconName } from "@/components/ui/icon";

/**
 * The keys a stored module row may carry. This list can gain entries but must not lose
 * them: `events.modules` is a jsonb column and `builtinSchema` validates against this enum,
 * so dropping a key makes every event that still has a row for it fail to parse - the
 * portal would 500 rather than ignore it.
 *
 * Which of these actually renders as a tile is TILE_BUILTINS, below.
 */
export const BUILTIN_MODULES = ["agenda", "seat", "floor_plan", "info", "announcements"] as const;
export type BuiltinKey = (typeof BUILTIN_MODULES)[number];

/**
 * The built-ins that are still tiles on the portal home.
 *
 * Agenda and Info are in the bottom nav, Announcements is the banner at the top of the
 * home, and the table number is on the badge card - so a tile for any of them was a second
 * route to something already on screen. Rows for the retired keys still parse; they simply
 * do not render, and the Modules page no longer offers switches for them.
 */
export const TILE_BUILTINS = ["floor_plan"] as const satisfies readonly BuiltinKey[];
const IS_TILE = new Set<string>(TILE_BUILTINS);
export const MODULE_ICONS = ["calendar", "seat", "map", "info", "megaphone", "mic", "file", "chat", "check", "phone", "link", "star", "users", "download"] as const satisfies readonly IconName[];
export type ModuleIcon = (typeof MODULE_ICONS)[number];

/**
 * Internal portal destinations a tile may point at. Like BUILTIN_MODULES this list is
 * validated against stored jsonb, so it may gain entries but must not lose them.
 *
 * `plan` is deliberately absent: the floor plan is its own preset, because it carries the
 * image URL the page needs and a generic route tile has nowhere to put one.
 */
export const TILE_ROUTES = ["agenda", "announcements", "info", "me", "seat", "stamps", "activities", "forms"] as const;
export type TileRoute = (typeof TILE_ROUTES)[number];

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
  forms: "Forms",
};

export type TileTarget = { kind: "url"; url: string } | { kind: "route"; route: TileRoute };

/**
 * `url` is only meaningful on `floor_plan`, which needs the plan image the destination
 * page renders. It lives on the module rather than on `events.floor_plan_url` so the
 * setting sits with the tile that uses it — but the column is still read as a fallback,
 * see floorPlanUrl.
 */
export type BuiltinModule = { key: BuiltinKey; enabled: boolean; label?: string; subtitle?: string; url?: string };
export type LinkModule = { key: "link"; id: string; enabled: boolean; label: string; subtitle?: string; url: string; icon: ModuleIcon };
/** An admin-authored tile. Replaces the four fixed `link` slots. */
export type TileModule = { key: "tile"; id: string; enabled: boolean; label: string; subtitle?: string; icon: ModuleIcon; target: TileTarget };
export type EventModule = BuiltinModule | LinkModule | TileModule;

const SAFE_URL = /^https?:\/\//i;
const builtinSchema = z.object({ key: z.enum(BUILTIN_MODULES), enabled: z.boolean(), label: z.string().min(1).max(40).optional(), subtitle: z.string().max(60).optional(), url: z.string().regex(SAFE_URL, "url must start with http:// or https://").optional() });
const linkSchema = z.object({
  key: z.literal("link"), id: z.string().regex(/^[a-z0-9_-]{1,32}$/), enabled: z.boolean(),
  label: z.string().min(1).max(40), subtitle: z.string().max(60).optional(),
  url: z.string().regex(SAFE_URL, "url must start with http:// or https://"), icon: z.enum(MODULE_ICONS),
});
const targetSchema = z.union([
  z.object({ kind: z.literal("url"), url: z.string().regex(SAFE_URL, "url must start with http:// or https://") }),
  z.object({ kind: z.literal("route"), route: z.enum(TILE_ROUTES) }),
]);
const tileSchema = z.object({
  key: z.literal("tile"), id: z.string().regex(/^[a-z0-9_-]{1,32}$/), enabled: z.boolean(),
  label: z.string().min(1).max(40), subtitle: z.string().max(60).optional(),
  icon: z.enum(MODULE_ICONS), target: targetSchema,
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

export function defaultModules(): EventModule[] {
  return TILE_BUILTINS.map((key) => ({ key, enabled: true }));
}

const DEFAULT_LABEL: Record<BuiltinKey, string> = { agenda: "Agenda", seat: "My seat", floor_plan: "Floor plan", info: "Info", announcements: "Announcements" };
const DEFAULT_ICON: Record<BuiltinKey, ModuleIcon> = { agenda: "calendar", seat: "seat", floor_plan: "map", info: "info", announcements: "megaphone" };

/**
 * The plan image for this event: the floor-plan tile's own url, falling back to the
 * `events.floor_plan_url` column.
 *
 * The fallback is not legacy tolerance for its own sake — it is what lets the column be
 * migrated into the modules array in one deploy and read in another. New code reads the
 * tile; rows not yet rewritten keep working; the column stays populated so a rollback to
 * the currently deployed code still finds a plan.
 */
export function floorPlanUrl(event: Pick<Event, "floor_plan_url" | "modules">): string | null {
  const m = event.modules?.find((x) => x.key === "floor_plan");
  const own = m && "url" in m ? m.url : undefined;
  return own || event.floor_plan_url || null;
}

/**
 * The stored modules as the editor and the portal should see them: legacy `link` rows
 * become `tile` rows, the floor plan carries the url it needs, and retired built-ins are
 * dropped.
 *
 * This is why the tiles rework needs no data migration. `events.modules` is jsonb, so the
 * old shapes keep parsing and are converted on read; the first save an admin makes writes
 * the new shape back. Rewriting every live row in SQL would buy nothing and would have to
 * be correct on the first attempt against production data.
 */
export function normalizeModules(event: Pick<Event, "floor_plan_url" | "modules">): EventModule[] {
  const plan = floorPlanUrl(event);
  const stored = event.modules?.length ? event.modules : defaultModules();
  const out: EventModule[] = [];
  for (const m of stored) {
    if (m.key === "link") {
      out.push({ key: "tile", id: m.id, enabled: m.enabled, label: m.label, ...(m.subtitle ? { subtitle: m.subtitle } : {}), icon: m.icon, target: { kind: "url", url: m.url } });
      continue;
    }
    if (m.key === "tile") { out.push(m); continue; }
    if (!IS_TILE.has(m.key)) continue;
    out.push({ ...m, ...(plan ? { url: plan } : {}) });
  }
  return out;
}

export type Tile = { id: string; label: string; subtitle: string; href: string; icon: ModuleIcon; external: boolean };

/**
 * `personal`, `attendee`, `next` and `latestAnnouncement` used to be inputs here: they
 * filled the subtitles of the agenda, seat and announcement tiles. Those tiles are gone,
 * and with them the only reason this function needed to know anything about who is looking
 * or what is happening. It now depends on the event and the path, and nothing else.
 */
export function resolveTiles(input: {
  event: Pick<Event, "floor_plan_url" | "info_page_html" | "info_page_title" | "modules">;
  basePath: string;
}): Tile[] {
  const { event, basePath } = input;
  const modules = event.modules?.length ? event.modules : defaultModules();
  const out: Tile[] = [];
  for (const m of modules) {
    if (!m.enabled) continue;
    // A row for a retired built-in parses but draws nothing.
    if (m.key !== "link" && m.key !== "tile" && !IS_TILE.has(m.key)) continue;
    if (m.key === "tile") {
      if (m.target.kind === "url") {
        // Re-checked here as well as in parseModules: a row written before this rule, or
        // edited around it, must never render as a javascript:/data: tile.
        if (!SAFE_URL.test(m.target.url)) continue;
        out.push({ id: `tile:${m.id}`, label: m.label, subtitle: m.subtitle ?? "", href: m.target.url, icon: m.icon, external: true });
        continue;
      }
      out.push({ id: `tile:${m.id}`, label: m.label, subtitle: m.subtitle ?? "", href: `${basePath}/${m.target.route}`, icon: m.icon, external: false });
      continue;
    }
    if (m.key === "link") {
      if (!SAFE_URL.test(m.url)) continue;
      out.push({ id: `link:${m.id}`, label: m.label, subtitle: m.subtitle ?? "", href: m.url, icon: m.icon, external: true });
      continue;
    }
    const label = m.label ?? (m.key === "info" ? event.info_page_title || DEFAULT_LABEL.info : DEFAULT_LABEL[m.key]);
    const icon = DEFAULT_ICON[m.key];
    switch (m.key) {
      case "floor_plan":
        if (!floorPlanUrl(event)) break;
        out.push({ id: "floor_plan", label, icon, external: false, href: `${basePath}/plan`, subtitle: m.subtitle ?? "Venue layout" });
        break;
    }
  }
  return out;
}
