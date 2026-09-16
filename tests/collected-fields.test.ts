import { describe, it, expect } from "vitest";
import { parseCollectedFields, collects, collectedFromForm, COLLECTED_FIELDS } from "@/lib/collected-fields";

describe("parseCollectedFields", () => {
  it("keeps the recognised fields in a fixed order, whatever order they were stored", () => {
    expect(parseCollectedFields(["table_no", "company"])).toEqual(["company", "table_no"]);
  });

  it("reads an un-migrated row as collecting everything, which is what every event did before", () => {
    expect(parseCollectedFields(undefined)).toEqual([...COLLECTED_FIELDS]);
    expect(parseCollectedFields(null)).toEqual([...COLLECTED_FIELDS]);
  });

  it("distinguishes an empty array from a missing one", () => {
    // [] is an organiser who turned all three off. Missing is a database that has not been
    // migrated. Reading them the same way would silently re-enable fields somebody cleared.
    expect(parseCollectedFields([])).toEqual([]);
  });

  it("drops anything unrecognised rather than throwing", () => {
    expect(parseCollectedFields(["company", "email", "nonsense", 7])).toEqual(["company"]);
  });

  it("drops repeats", () => {
    expect(parseCollectedFields(["phone", "phone"])).toEqual(["phone"]);
  });
});

describe("collects", () => {
  it("answers for one field", () => {
    const ev = { collected_fields: ["company", "table_no"] as const };
    expect(collects({ collected_fields: [...ev.collected_fields] }, "company")).toBe(true);
    expect(collects({ collected_fields: [...ev.collected_fields] }, "phone")).toBe(false);
  });
});

describe("collectedFromForm", () => {
  it("reads the ticked boxes, and nothing ticked means nothing collected", () => {
    expect(collectedFromForm(["company"])).toEqual(["company"]);
    expect(collectedFromForm([])).toEqual([]);
  });
});
