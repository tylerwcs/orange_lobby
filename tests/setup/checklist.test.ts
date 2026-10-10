import { describe, expect, it } from "vitest";
import { buildChecklist } from "@/features/setup/checklist";
import { featureSet } from "@/features/catalogue/features";

const base = { custom: [], selfRegistration: false, builtSteps: ["basics"] as const };

describe("buildChecklist (D444)", () => {
  it("lists only base items for an event with no add-ons, steps first", () => {
    const list = buildChecklist({ ...base, features: featureSet([], 0) });
    expect(list.map((e) => e.key)).toEqual(["basics", "agenda", "info", "attendee-list", "check-in"]);
    expect(list[0]).toMatchObject({ kind: "step", title: "Event basics" });
  });
  it("shows a step not built yet as a card", () => {
    const list = buildChecklist({ ...base, features: featureSet([], 0) });
    expect(list.find((e) => e.key === "agenda")?.kind).toBe("card");
    expect(list.find((e) => e.key === "basics")?.kind).toBe("step");
  });
  it("adds a card per add-on the event has", () => {
    const keys = buildChecklist({ ...base, features: featureSet(["lucky_draw", "whatsapp"], 0) }).map((e) => e.key);
    expect(keys).toContain("lucky-draw");
    expect(keys).toContain("whatsapp");
    expect(keys).not.toContain("live-games");
  });
  it("shows registration questions only when attendees sign up themselves", () => {
    expect(buildChecklist({ ...base, features: featureSet([], 0) }).map((e) => e.key)).not.toContain("registration");
    expect(buildChecklist({ ...base, selfRegistration: true, features: featureSet([], 0) }).map((e) => e.key)).toContain("registration");
  });
  it("adds one card per custom module, with its description", () => {
    const list = buildChecklist({ ...base, features: featureSet([], 1), custom: [{ id: "m1", name: "Photo mosaic wall", description: "Live wall of guest photos" }] });
    expect(list.find((e) => e.key === "custom:m1")).toMatchObject({ kind: "card", title: "Custom: Photo mosaic wall", send: ["Live wall of guest photos"] });
  });
  it("gives a custom module with no description a default line", () => {
    const list = buildChecklist({ ...base, features: featureSet([], 1), custom: [{ id: "m1", name: "Mosaic", description: null }] });
    expect(list.find((e) => e.key === "custom:m1")?.send).toEqual(["We'll be in touch about what we need for this."]);
  });
  it("orders steps, then base cards, then add-on cards, then custom modules", () => {
    const keys = buildChecklist({ ...base, features: featureSet(["whatsapp"], 1), custom: [{ id: "m1", name: "Mosaic", description: null }] }).map((e) => e.key);
    expect(keys).toEqual(["basics", "agenda", "info", "attendee-list", "check-in", "whatsapp", "custom:m1"]);
  });
});
