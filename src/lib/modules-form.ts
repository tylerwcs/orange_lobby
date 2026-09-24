import { parseModules, type EventModule } from "@/lib/modules";

/**
 * How many tiles one event may carry. The portal home is a grid an attendee scans in a
 * second, not a menu — but the old limit of four fixed link slots was an artefact of the
 * form, not a judgement about the grid.
 */
export const MAX_TILES = 16;

/** The id of a module row. The floor plan is a singleton, so its key is its identity. */
export function moduleId(m: EventModule): string {
  return "id" in m ? m.id : m.key;
}

/**
 * One module from the tile editor's form.
 *
 * `id` is supplied by the caller rather than read from the form: a new tile needs a fresh
 * one and a pure function is the wrong place to make randomness. It is ignored for the
 * floor plan, which is identified by its key.
 */
export function moduleFromForm(get: (key: string) => string | null, id: string): EventModule {
  const t = (k: string) => (get(k) ?? "").trim();
  const enabled = get("enabled") === "on";
  const label = t("label");
  const subtitle = t("subtitle");
  const withSubtitle = subtitle ? { subtitle } : {};
  const withImage = t("icon_image") ? { icon_image: t("icon_image") } : {};

  if (t("preset") === "floor_plan") {
    return parseModules([{ key: "floor_plan", enabled, ...(label ? { label } : {}), ...withSubtitle, ...(t("url") ? { url: t("url") } : {}), ...withImage }])[0];
  }

  // Both inputs stay mounted in the form so switching kind does not lose what was typed,
  // which means the unchosen one is still posted. Only the chosen one is read.
  const target = t("target_kind") === "route"
    ? { kind: "route", route: t("route") }
    : { kind: "url", url: t("url") };

  return parseModules([{ key: "tile", id, enabled, label, ...withSubtitle, icon: t("icon") || "link", ...withImage, target }])[0];
}

/** Replaces the row with the same id, or appends it. Order is never disturbed by an edit. */
export function upsertModule(modules: EventModule[], next: EventModule): EventModule[] {
  const id = moduleId(next);
  const at = modules.findIndex((m) => moduleId(m) === id);
  if (at >= 0) return modules.map((m, i) => (i === at ? next : m));
  if (modules.length >= MAX_TILES) throw new Error(`You can have at most ${MAX_TILES} tiles`);
  return [...modules, next];
}

export function removeModule(modules: EventModule[], id: string): EventModule[] {
  return modules.filter((m) => moduleId(m) !== id);
}

/**
 * Rearranges to the posted order. Anything the posted list does not mention keeps its
 * place at the end rather than being dropped — a reorder is never a delete, and a tab
 * opened before another tile was added must not silently remove it.
 */
export function reorderModules(modules: EventModule[], ids: string[]): EventModule[] {
  const byId = new Map(modules.map((m) => [moduleId(m), m]));
  const out: EventModule[] = [];
  for (const id of ids) {
    const m = byId.get(id);
    if (m) { out.push(m); byId.delete(id); }
  }
  return [...out, ...byId.values()];
}
