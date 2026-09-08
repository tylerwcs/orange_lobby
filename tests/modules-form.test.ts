import { describe, it, expect } from "vitest";
import { modulesFromForm } from "@/lib/modules-form";

const form = (o: Record<string, string>) => (k: string) => o[k] ?? null;

describe("modulesFromForm", () => {
  it("keeps builtin order, reads toggles and overrides, and appends filled link rows", () => {
    const mods = modulesFromForm(form({
      mod_agenda_enabled: "on", mod_seat_enabled: "on", mod_info_enabled: "on", mod_info_label: "Handbook",
      link_1_enabled: "on", link_1_label: "Q&A", link_1_url: "https://app.sli.do/x", link_1_icon: "chat", link_1_subtitle: "Ask the directors",
      link_2_label: "", link_2_url: "",
    }));
    expect(mods.map((m) => m.key)).toEqual(["agenda", "seat", "floor_plan", "info", "announcements", "link"]);
    expect(mods[2]).toMatchObject({ key: "floor_plan", enabled: false });
    expect(mods[3]).toMatchObject({ key: "info", enabled: true, label: "Handbook" });
    expect(mods[5]).toMatchObject({ key: "link", id: "l1", enabled: true, label: "Q&A", url: "https://app.sli.do/x", icon: "chat", subtitle: "Ask the directors" });
  });
  it("throws a readable error for a bad link url", () => {
    expect(() => modulesFromForm(form({ link_1_enabled: "on", link_1_label: "Bad", link_1_url: "ftp://x", link_1_icon: "chat" }))).toThrow(/url/);
  });
});
