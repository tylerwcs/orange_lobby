import { z } from "zod";
import type { AgendaItem, Attendee, Event } from "@/lib/types";
import type { IconName } from "@/components/ui/icon-paths";

export const BUILTIN_MODULES = ["agenda", "seat", "floor_plan", "info", "announcements"] as const;
export type BuiltinKey = (typeof BUILTIN_MODULES)[number];
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
  return BUILTIN_MODULES.map((key) => ({ key, enabled: true }));
}

const DEFAULT_LABEL: Record<BuiltinKey, string> = { agenda: "Agenda", seat: "My seat", floor_plan: "Floor plan", info: "Info", announcements: "Announcements" };
const DEFAULT_ICON: Record<BuiltinKey, ModuleIcon> = { agenda: "calendar", seat: "seat", floor_plan: "map", info: "info", announcements: "megaphone" };

export type Tile = { id: string; label: string; subtitle: string; href: string; icon: ModuleIcon; external: boolean };

export function resolveTiles(input: {
  event: Pick<Event, "floor_plan_url" | "info_page_html" | "info_page_title" | "modules">;
  personal: boolean; basePath: string;
  attendee?: Pick<Attendee, "table_no" | "seat_no"> | null;
  next?: { item: AgendaItem; status: "now" | "next" } | null;
  latestAnnouncement?: string | null;
}): Tile[] {
  const { event, personal, basePath, attendee, next, latestAnnouncement } = input;
  const modules = event.modules?.length ? event.modules : defaultModules();
  const out: Tile[] = [];
  for (const m of modules) {
    if (!m.enabled) continue;
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
      case "agenda":
        out.push({ id: "agenda", label, icon, external: false, href: `${basePath}/agenda`,
          subtitle: m.subtitle ?? (next ? `${next.status === "now" ? "Now" : "Next"}: ${next.item.starts_at} ${next.item.title}` : "Programme") });
        break;
      case "seat":
        if (!personal) break;
        out.push({ id: "seat", label, icon, external: false, href: `${basePath}/seat`,
          subtitle: m.subtitle ?? (attendee?.table_no ? `Table ${attendee.table_no}${attendee.seat_no ? ` · Seat ${attendee.seat_no}` : ""}` : "To be confirmed") });
        break;
      case "floor_plan":
        if (!event.floor_plan_url) break;
        out.push({ id: "floor_plan", label, icon, external: false, href: `${basePath}/plan`, subtitle: m.subtitle ?? "Venue layout" });
        break;
      case "info":
        if (!event.info_page_html) break;
        out.push({ id: "info", label, icon, external: false, href: `${basePath}/info`, subtitle: m.subtitle ?? "Everything you need to know" });
        break;
      case "announcements":
        out.push({ id: "announcements", label, icon, external: false, href: `${basePath}/announcements`, subtitle: m.subtitle ?? latestAnnouncement ?? "No announcements yet" });
        break;
    }
  }
  return out;
}
