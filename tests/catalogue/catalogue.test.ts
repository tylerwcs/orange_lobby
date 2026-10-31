import { describe, expect, it } from "vitest";
import {
  ADDON_KEYS, CORE_KEYS, FEATURES, STORED_ADDONS, ACTIVITY_KIND_ORDER, GAME_KIND_ORDER,
  featureSet, has, activityKindsFor, gameKindsFor, featureForActivityKind, featureForGameKind,
  hiddenNav, hiddenSettingsParts, notPartOf, isStoredAddon,
} from "@/features/catalogue/client";
// Straight from the defining files, as tests/games does: the games client entry also exports
// its screens, which vitest's node environment has no reason to load.
import { ACTIVITY_KINDS } from "@/features/activities/kinds/meta";
import { GAME_KINDS } from "@/features/games/config";

const none = featureSet([], 0);
const all = featureSet(STORED_ADDONS, 1);

describe("the catalogue (D433)", () => {
  it("gives core keys tier core and add-ons optional or experimental (D777)", () => {
    for (const k of CORE_KEYS) expect(FEATURES[k].tier).toBe("core");
    for (const k of ADDON_KEYS) expect(["optional", "experimental"]).toContain(FEATURES[k].tier);
    expect(FEATURES.language.tier).toBe("experimental");
    expect(FEATURES.popups.tier).toBe("experimental");
  });
  it("stores every add-on except custom (D436)", () => {
    expect(STORED_ADDONS).toEqual(["whatsapp", "booking", "engagement", "live_games", "lucky_draw", "custom_domain", "slido", "typing_qualifier", "language", "popups"]);
  });
  it("orders activity and game kinds the way their menus do", () => {
    expect([...ACTIVITY_KIND_ORDER]).toEqual([...ACTIVITY_KINDS]);
    expect([...GAME_KIND_ORDER]).toEqual([...GAME_KINDS]);
  });
  it("unlocks every activity kind and every game kind through exactly one add-on", () => {
    for (const kind of ACTIVITY_KINDS) expect(ADDON_KEYS.filter((a) => FEATURES[a].unlocks.activityKinds?.includes(kind))).toHaveLength(1);
    for (const kind of GAME_KINDS) expect(ADDON_KEYS.filter((a) => FEATURES[a].unlocks.gameKinds?.includes(kind))).toHaveLength(1);
  });
});

describe("featureSet and has (D437)", () => {
  it("treats core features as always on", () => {
    for (const k of CORE_KEYS) expect(has(none, k)).toBe(true);
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
    expect(activityKindsFor(featureSet(["engagement"], 0))).toEqual(["submission", "passport", "polaroid", "tournament"]);
  });
  it("splits games between Live games and Lucky draw", () => {
    expect(gameKindsFor(featureSet(["live_games"], 0))).toEqual(["tap_race", "survival"]);
    expect(gameKindsFor(featureSet(["lucky_draw"], 0))).toEqual(["draw"]);
  });
  it("allows every kind with every add-on, in menu order", () => {
    expect(activityKindsFor(all)).toEqual(["booking", "submission", "passport", "polaroid", "tournament"]);
    expect(gameKindsFor(all)).toEqual(["tap_race", "survival", "draw"]);
  });
  it("names the add-on behind each kind", () => {
    expect(featureForActivityKind("booking")).toBe("booking");
    expect(featureForActivityKind("submission")).toBe("engagement");
    expect(featureForActivityKind("passport")).toBe("engagement");
    expect(featureForActivityKind("polaroid")).toBe("engagement");
    expect(featureForActivityKind("tournament")).toBe("engagement");
    expect(featureForGameKind("tap_race")).toBe("live_games");
    expect(featureForGameKind("survival")).toBe("live_games");
    expect(featureForGameKind("draw")).toBe("lucky_draw");
  });
});

describe("hidden admin areas (D438)", () => {
  it("hides WhatsApp, Activities, Games, the qualifier and Popups with no add-ons", () => {
    expect(hiddenNav(none)).toEqual(["whatsapp", "activities", "games", "qualifier", "popups"]);
  });
  it("hides nothing with every add-on", () => {
    expect(hiddenNav(all)).toEqual([]);
    expect(hiddenSettingsParts(all)).toEqual([]);
  });
  it("keeps Activities while either activity add-on is on", () => {
    expect(hiddenNav(featureSet(["booking"], 0))).not.toContain("activities");
    expect(hiddenNav(featureSet(["engagement"], 0))).not.toContain("activities");
  });
  it("shows the Typing qualifier item only with that add-on (D770)", () => {
    expect(hiddenNav(featureSet(["typing_qualifier"], 0))).not.toContain("qualifier");
    expect(hiddenNav(featureSet(["whatsapp"], 0))).toContain("qualifier");
  });
  it("hides Popups without the add-on", () => {
    expect(hiddenNav(none)).toContain("popups");
    expect(hiddenNav(featureSet(["popups"], 0))).not.toContain("popups");
  });
  it("hides the language, alerts and address parts without their add-ons", () => {
    expect(hiddenSettingsParts(none)).toEqual(["address", "language", "committee_alerts"]);
    expect(hiddenSettingsParts(featureSet(["booking", "language"], 0))).toEqual(["address"]);
    expect(hiddenSettingsParts(featureSet(["custom_domain"], 0))).toEqual(["language", "committee_alerts"]);
  });
});

describe("notPartOf and isStoredAddon", () => {
  it("says what is missing and where to turn it on", () => {
    expect(notPartOf("lucky_draw")).toBe("Lucky draw isn't part of this event. Turn it on in Settings → What's on.");
    expect(notPartOf("popups")).toBe("Portal popups isn't part of this event. Turn it on in Settings → What's on.");
  });
  it("accepts only storable add-on keys", () => {
    expect(isStoredAddon("whatsapp")).toBe(true);
    expect(isStoredAddon("custom")).toBe(false);
    expect(isStoredAddon("agenda")).toBe(false);
    expect(isStoredAddon("raffle")).toBe(false);
  });
});
