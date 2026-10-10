import { describe, expect, it } from "vitest";
import {
  ADDON_KEYS, BASE_KEYS, FEATURES, STORED_ADDONS, ACTIVITY_KIND_ORDER, GAME_KIND_ORDER,
  featureSet, has, activityKindsFor, gameKindsFor, featureForActivityKind, featureForGameKind,
  hiddenNav, hiddenSettingsTabs, notPartOf, isStoredAddon,
} from "@/features/catalogue/client";
// Straight from the defining files, as tests/games does: the games client entry also exports
// its screens, which vitest's node environment has no reason to load.
import { ACTIVITY_KINDS } from "@/features/activities/kinds/meta";
import { GAME_KINDS } from "@/features/games/config";

const none = featureSet([], 0);
const all = featureSet(STORED_ADDONS, 1);

describe("the catalogue (D433)", () => {
  it("defines every base and add-on key, with the right tier", () => {
    for (const k of BASE_KEYS) expect(FEATURES[k].tier).toBe("base");
    for (const k of ADDON_KEYS) expect(FEATURES[k].tier).toBe("addon");
  });
  it("stores every add-on except custom (D436)", () => {
    expect(STORED_ADDONS).toEqual(["whatsapp", "booking", "engagement", "live_games", "lucky_draw", "custom_domain", "slido"]);
  });
  it("orders activity and game kinds the way their menus do", () => {
    expect([...ACTIVITY_KIND_ORDER]).toEqual([...ACTIVITY_KINDS]);
    expect([...GAME_KIND_ORDER]).toEqual([...GAME_KINDS]);
  });
  it("unlocks every activity kind and every game kind through exactly one add-on", () => {
    for (const kind of ACTIVITY_KINDS) expect(ADDON_KEYS.filter((a) => FEATURES[a].unlocks.activityKinds?.includes(kind))).toHaveLength(1);
    for (const kind of GAME_KINDS) expect(ADDON_KEYS.filter((a) => FEATURES[a].unlocks.gameKinds?.includes(kind))).toHaveLength(1);
  });
  it("gives every setup item a unique key, and only sections as steps (D444)", () => {
    const items = (Object.values(FEATURES) as { setup?: readonly { key: string; kind: string }[] }[]).flatMap((f) => f.setup ?? []);
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(items.filter((i) => i.kind === "step").map((i) => i.key).sort()).toEqual(["agenda", "basics", "info"]);
  });
});

describe("featureSet and has (D437)", () => {
  it("treats base features as always on", () => {
    for (const k of BASE_KEYS) expect(has(none, k)).toBe(true);
  });
  it("has an add-on only when it is stored", () => {
    const fs = featureSet(["whatsapp"], 0);
    expect(has(fs, "whatsapp")).toBe(true);
    expect(has(fs, "booking")).toBe(false);
  });
  it("ignores a stored key the code no longer knows", () => {
    expect([...featureSet(["raffle", "whatsapp"], 0).addons]).toEqual(["whatsapp"]);
  });
  it("has custom exactly when there is a custom module, whatever is stored", () => {
    expect(has(featureSet([], 0), "custom")).toBe(false);
    expect(has(featureSet([], 2), "custom")).toBe(true);
    expect(has(featureSet(["custom"], 0), "custom")).toBe(false);
  });
});

describe("allowed kinds", () => {
  it("allows no activity or game kind with no add-ons", () => {
    expect(activityKindsFor(none)).toEqual([]);
    expect(gameKindsFor(none)).toEqual([]);
  });
  it("allows booking alone with Session booking", () => {
    expect(activityKindsFor(featureSet(["booking"], 0))).toEqual(["booking"]);
  });
  it("allows submission and passport with Engagement activities", () => {
    expect(activityKindsFor(featureSet(["engagement"], 0))).toEqual(["submission", "passport"]);
  });
  it("splits games between Live games and Lucky draw", () => {
    expect(gameKindsFor(featureSet(["live_games"], 0))).toEqual(["tap_race", "survival"]);
    expect(gameKindsFor(featureSet(["lucky_draw"], 0))).toEqual(["draw"]);
  });
  it("allows every kind with every add-on, in menu order", () => {
    expect(activityKindsFor(all)).toEqual(["booking", "submission", "passport"]);
    expect(gameKindsFor(all)).toEqual(["tap_race", "survival", "draw"]);
  });
  it("names the add-on behind each kind", () => {
    expect(featureForActivityKind("booking")).toBe("booking");
    expect(featureForActivityKind("submission")).toBe("engagement");
    expect(featureForActivityKind("passport")).toBe("engagement");
    expect(featureForGameKind("tap_race")).toBe("live_games");
    expect(featureForGameKind("survival")).toBe("live_games");
    expect(featureForGameKind("draw")).toBe("lucky_draw");
  });
});

describe("hidden admin areas (D438)", () => {
  it("hides WhatsApp, Activities and Games with no add-ons", () => {
    expect(hiddenNav(none)).toEqual(["whatsapp", "activities", "games"]);
  });
  it("hides nothing with every add-on", () => {
    expect(hiddenNav(all)).toEqual([]);
    expect(hiddenSettingsTabs(all)).toEqual([]);
  });
  it("keeps Activities while either activity add-on is on", () => {
    expect(hiddenNav(featureSet(["booking"], 0))).not.toContain("activities");
    expect(hiddenNav(featureSet(["engagement"], 0))).not.toContain("activities");
  });
  it("hides the Address tab without Custom domain", () => {
    expect(hiddenSettingsTabs(none)).toEqual(["address"]);
    expect(hiddenSettingsTabs(featureSet(["custom_domain"], 0))).toEqual([]);
  });
});

describe("notPartOf and isStoredAddon", () => {
  it("says what is missing and where to turn it on", () => {
    expect(notPartOf("lucky_draw")).toBe("Lucky draw isn't part of this event. Turn it on in Settings → Features.");
  });
  it("accepts only storable add-on keys", () => {
    expect(isStoredAddon("whatsapp")).toBe(true);
    expect(isStoredAddon("custom")).toBe(false);
    expect(isStoredAddon("agenda")).toBe(false);
    expect(isStoredAddon("raffle")).toBe(false);
  });
});
