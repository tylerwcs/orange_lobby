import { describe, expect, it } from "vitest";
import { problemSentence, SECTION_TITLES, SETUP_SECTIONS } from "@/features/setup/sections";

describe("sections (D461)", () => {
  it("has two sections, each titled", () => {
    expect([...SETUP_SECTIONS]).toEqual(["basics", "agenda"]);
    expect(SECTION_TITLES).toEqual({ basics: "Event basics", agenda: "Agenda" });
  });
  it("says the first problem, and how many more", () => {
    expect(problemSentence([])).toBeNull();
    expect(problemSentence(["A."])).toBe("A.");
    expect(problemSentence(["A.", "B.", "C."])).toBe("A. (and 2 more)");
  });
});
