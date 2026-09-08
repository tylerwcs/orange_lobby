import { BUILTIN_MODULES, parseModules, type EventModule } from "@/lib/modules";

export const MAX_LINK_TILES = 4;

export function modulesFromForm(get: (key: string) => string | null): EventModule[] {
  const t = (k: string) => (get(k) ?? "").trim();
  const raw: unknown[] = BUILTIN_MODULES.map((key) => ({
    key, enabled: get(`mod_${key}_enabled`) === "on",
    ...(t(`mod_${key}_label`) ? { label: t(`mod_${key}_label`) } : {}),
    ...(t(`mod_${key}_subtitle`) ? { subtitle: t(`mod_${key}_subtitle`) } : {}),
  }));
  for (let n = 1; n <= MAX_LINK_TILES; n++) {
    const label = t(`link_${n}_label`), url = t(`link_${n}_url`);
    if (!label && !url) continue;
    raw.push({ key: "link", id: `l${n}`, enabled: get(`link_${n}_enabled`) === "on", label, url, icon: t(`link_${n}_icon`) || "link",
      ...(t(`link_${n}_subtitle`) ? { subtitle: t(`link_${n}_subtitle`) } : {}) });
  }
  return parseModules(raw);
}
