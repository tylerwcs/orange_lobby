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

export type BuiltinModule = { key: BuiltinKey; enabled: boolean; label?: string; subtitle?: string };
export type LinkModule = { key: "link"; id: string; enabled: boolean; label: string; subtitle?: string; url: string; icon: ModuleIcon };
export type EventModule = BuiltinModule | LinkModule;

const SAFE_URL = /^https?:\/\//i;
const builtinSchema = z.object({ key: z.enum(BUILTIN_MODULES), enabled: z.boolean(), label: z.string().min(1).max(40).optional(), subtitle: z.string().max(60).optional() });
const linkSchema = z.object({
  key: z.literal("link"), id: z.string().regex(/^[a-z0-9_-]{1,32}$/), enabled: z.boolean(),
  label: z.string().min(1).max(40), subtitle: z.string().max(60).optional(),
  url: z.string().regex(SAFE_URL, "url must start with http:// or https://"), icon: z.enum(MODULE_ICONS),
});
const moduleSchema = z.union([builtinSchema, linkSchema]);

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
    if (m.key !== "link" && !IS_TILE.has(m.key)) continue;
    // Re-check the url here too: rows written before this rule, or edited around
    // parseModules, must never render as a javascript:/data: tile.
    if (m.key === "link") {
      if (!SAFE_URL.test(m.url)) continue;
      out.push({ id: `link:${m.id}`, label: m.label, subtitle: m.subtitle ?? "", href: m.url, icon: m.icon, external: true });
      continue;
    }
    const label = m.label ?? (m.key === "info" ? event.info_page_title || DEFAULT_LABEL.info : DEFAULT_LABEL[m.key]);
    const icon = DEFAULT_ICON[m.key];
    switch (m.key) {
      case "floor_plan":
        if (!event.floor_plan_url) break;
        out.push({ id: "floor_plan", label, icon, external: false, href: `${basePath}/plan`, subtitle: m.subtitle ?? "Venue layout" });
        break;
    }
  }
  return out;
}
