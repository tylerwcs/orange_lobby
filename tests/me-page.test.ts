import { describe, it, expect } from "vitest";
import { meGroups, meHiddenFromForm, meAnswerFields, parseMeHidden, ME_BADGE, ME_CATEGORY, ME_EMAIL, ME_TABLE } from "@/lib/me-page";

const ev = {
  registration_questions: [],
  attendee_fields: [
    { key: "table_no", label: "Table", type: "text" as const },
    { key: "company", label: "Company", type: "text" as const },
    { key: "shirt", label: "Shirt size", type: "text" as const },
  ],
};

describe("meGroups", () => {
  it("lists the card's parts, email, then every answer bar the table", () => {
    const keys = meGroups(ev).map((g) => [g.title, g.items.map((i) => i.key)]);
    expect(keys).toEqual([
      ["Profile card", [ME_CATEGORY, ME_TABLE, ME_BADGE]],
      ["Your details", [ME_EMAIL]],
      ["What you told us", ["company", "shirt"]],
    ]);
  });

  it("drops the answers group when the event asks nothing", () => {
    expect(meGroups({ registration_questions: [], attendee_fields: [] }).map((g) => g.title)).toEqual(["Profile card", "Your details"]);
  });

  it("keeps an organiser column keyed like a built-in apart from it", () => {
    const e = { registration_questions: [], attendee_fields: [{ key: "email", label: "Work email", type: "text" as const }] };
    expect(meAnswerFields(e).map((f) => f.key)).toEqual(["email"]);
    expect(meHiddenFromForm(["email"], meGroups(e))).toContain(ME_EMAIL);
    expect(meHiddenFromForm(["email"], meGroups(e))).not.toContain("email");
  });
});

describe("meHiddenFromForm", () => {
  it("stores what was not ticked", () => {
    expect(meHiddenFromForm([ME_CATEGORY, ME_TABLE, ME_EMAIL, "company"], meGroups(ev))).toEqual([ME_BADGE, "shirt"]);
  });

  it("hides nothing when everything is ticked, and ignores keys not on the list", () => {
    const all = meGroups(ev).flatMap((g) => g.items.map((i) => i.key));
    expect(meHiddenFromForm([...all, "made_up"], meGroups(ev))).toEqual([]);
  });
});

describe("parseMeHidden", () => {
  it("reads a list of strings and treats anything else as nothing hidden", () => {
    expect(parseMeHidden(["a", 1, "b"])).toEqual(["a", "b"]);
    expect(parseMeHidden(undefined)).toEqual([]);
    expect(parseMeHidden({})).toEqual([]);
  });
});
