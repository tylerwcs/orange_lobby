import type { ActivityKind } from "@/lib/types";
import type { GameKind } from "@/features/games/client";
import {
  ADDON_KEYS, FEATURES, STORED_ADDONS, ACTIVITY_KIND_ORDER, GAME_KIND_ORDER,
  type AddonKey, type FeatureKey, type NavKey, type SettingsTabKey, type StoredAddon,
} from "./catalogue";

/** An event's add-ons. Base features are not in it: `has` answers yes for them (D437). */
export type FeatureSet = { readonly addons: ReadonlySet<AddonKey> };

export function isStoredAddon(key: string): key is StoredAddon {
  return (STORED_ADDONS as readonly string[]).includes(key);
}

/** From the stored rows and the number of custom modules. A stored key the code no longer knows is ignored. */
export function featureSet(stored: readonly string[], customCount: number): FeatureSet {
  const addons = new Set<AddonKey>(stored.filter(isStoredAddon));
  if (customCount > 0) addons.add("custom");
  return { addons };
}

export function has(fs: FeatureSet, key: FeatureKey): boolean {
  return FEATURES[key].tier === "base" || fs.addons.has(key as AddonKey);
}

const unlockedBy = (fs: FeatureSet, pick: (a: AddonKey) => readonly string[] | undefined) =>
  new Set([...fs.addons].flatMap((a) => pick(a) ?? []));

export function activityKindsFor(fs: FeatureSet): ActivityKind[] {
  const on = unlockedBy(fs, (a) => FEATURES[a].unlocks.activityKinds);
  return ACTIVITY_KIND_ORDER.filter((k) => on.has(k));
}

export function gameKindsFor(fs: FeatureSet): GameKind[] {
  const on = unlockedBy(fs, (a) => FEATURES[a].unlocks.gameKinds);
  return GAME_KIND_ORDER.filter((k) => on.has(k));
}

export function featureForActivityKind(kind: ActivityKind): AddonKey {
  const key = ADDON_KEYS.find((a) => FEATURES[a].unlocks.activityKinds?.includes(kind));
  if (!key) throw new Error(`No add-on unlocks the ${kind} activity kind`);
  return key;
}

export function featureForGameKind(kind: GameKind): AddonKey {
  const key = ADDON_KEYS.find((a) => FEATURES[a].unlocks.gameKinds?.includes(kind));
  if (!key) throw new Error(`No add-on unlocks the ${kind} game kind`);
  return key;
}

/** Sidebar items to leave out, in sidebar order (D438). */
export function hiddenNav(fs: FeatureSet): NavKey[] {
  const nav = unlockedBy(fs, (a) => FEATURES[a].unlocks.nav);
  const out: NavKey[] = [];
  if (!nav.has("whatsapp")) out.push("whatsapp");
  if (activityKindsFor(fs).length === 0) out.push("activities");
  if (gameKindsFor(fs).length === 0) out.push("games");
  return out;
}

export function hiddenSettingsTabs(fs: FeatureSet): SettingsTabKey[] {
  const tabs = unlockedBy(fs, (a) => FEATURES[a].unlocks.settingsTabs);
  return (["address"] as const).filter((t) => !tabs.has(t));
}

export function notPartOf(key: FeatureKey): string {
  return `${FEATURES[key].name} isn't part of this event. Turn it on in Settings → Features.`;
}
