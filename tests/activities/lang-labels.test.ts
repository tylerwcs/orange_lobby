import { describe, it, expect } from "vitest";
import { dayRange } from "@/features/activities/lib/activity-card";
import { sessionLabel } from "@/features/activities/lib/activities";

describe("activity labels in Bahasa Malaysia (D737)", () => {
  it("dayRange uses Malay names", () => {
    expect(dayRange(["2026-11-01", "2026-11-03"], "ms")).toBe("1 – 3 Nov");
    expect(dayRange(["2026-11-30", "2026-12-02"], "ms")).toBe("30 Nov – 2 Dis");
    expect(dayRange(["2026-11-01"], "ms")).toBe("Ahd 1 Nov");
  });
  it("sessionLabel uses a Malay weekday", () => {
    expect(sessionLabel({ day: "2026-11-01", starts_at: "09:00" }, { lang: "ms" })).toBe("Ahd 1 Nov · 09:00");
    expect(sessionLabel({ day: "2026-11-01", starts_at: "09:00" }, { weekday: false, lang: "ms" })).toBe("1 Nov · 09:00");
  });
  it("stays English by default", () => {
    expect(sessionLabel({ day: "2026-11-01", starts_at: "09:00" })).toBe("Sun 1 Nov · 09:00");
  });
});
