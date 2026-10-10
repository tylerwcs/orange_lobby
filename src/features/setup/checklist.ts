import { ADDON_KEYS, BASE_KEYS, FEATURES, has, type FeatureSet, type SetupItem } from "@/features/catalogue/client";

const CUSTOM_DEFAULT_LINE = "We'll be in touch about what we need for this.";

export type ChecklistEntry = { key: string; kind: "step" | "card"; title: string; send: readonly string[] };

/**
 * Everything this event needs from its organiser (D444). Steps come first, in
 * catalogue order (basics, agenda, info). Then the guide cards in catalogue order, base features
 * before add-ons, then one card per custom module. A step not built yet is shown as a card but
 * still sorts with the steps, so the checklist is complete from the first release (D452).
 */
export function buildChecklist(input: {
  features: FeatureSet;
  custom: readonly { id: string; name: string; description: string | null }[];
  selfRegistration: boolean;
  builtSteps: readonly string[];
}): ChecklistEntry[] {
  const { features, custom, selfRegistration, builtSteps } = input;
  const items: (SetupItem & { order: number })[] = [];
  for (const key of [...BASE_KEYS, ...ADDON_KEYS]) {
    if (!has(features, key)) continue;
    for (const item of FEATURES[key].setup ?? []) {
      if (item.onlyWithRegistration && !selfRegistration) continue;
      items.push({ ...item, order: items.length });
    }
  }
  for (const m of custom) {
    items.push({
      key: `custom:${m.id}`, kind: "card", title: `Custom: ${m.name}`,
      send: [m.description?.trim() || CUSTOM_DEFAULT_LINE], order: items.length,
    });
  }
  return items
    .sort((a, b) => Number(a.kind !== "step") - Number(b.kind !== "step") || a.order - b.order)
    .map((i) => ({
      key: i.key,
      kind: i.kind === "step" && builtSteps.includes(i.key) ? "step" : "card",
      title: i.title,
      send: i.send,
    }));
}
