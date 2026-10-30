import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { doorSurveyRefusal, offersSurvey, stripScan } from "@/lib/door-survey";

describe("offersSurvey (D762)", () => {
  it("offers it to someone just checked in or already in, and nobody else", () => {
    const all = ["ok", "duplicate", "notfound", "error", "undone", "not_booked"] as const;
    expect(all.filter(offersSurvey)).toEqual(["ok", "duplicate"]);
  });
});

describe("doorSurveyRefusal (D762)", () => {
  const fine = { hasSurvey: true, checkedInHere: true, cancelled: false, activityMatches: true };
  it("allows the door's own survey for someone checked in there", () => {
    expect(doorSurveyRefusal(fine)).toBeNull();
  });
  it("refuses a door with no survey, or a form that isn't the door's", () => {
    expect(doorSurveyRefusal({ ...fine, hasSurvey: false })).toBe("This door has no survey.");
    expect(doorSurveyRefusal({ ...fine, activityMatches: false })).toBe("This door has no survey.");
  });
  it("refuses someone not checked in at this door", () => {
    expect(doorSurveyRefusal({ ...fine, checkedInHere: false })).toBe("Scan them in at this door first.");
  });
  it("refuses a cancelled registration", () => {
    expect(doorSurveyRefusal({ ...fine, cancelled: true })).toBe("This registration was cancelled.");
  });
});

describe("stripScan (D765)", () => {
  it("takes a badge scan back out of the answer it was typed into", () => {
    expect(stripScan("Hypertensionzzqdetaqqqqq", "zzqdetaqqqqq")).toBe("Hypertension");
    expect(stripScan("https://x.test/a/zzqdetaqqqqq", "https://x.test/a/zzqdetaqqqqq")).toBe("");
  });
  it("leaves an answer alone when the scan didn't land in it", () => {
    expect(stripScan("Hypertension", "zzqdetaqqqqq")).toBe("Hypertension");
  });
});

describe("the door survey form (D765)", () => {
  it("never offers one attendee's typed answers to the next on a shared device", () => {
    const src = readFileSync("src/app/scan/[eventId]/DoorSurvey.tsx", "utf8");
    expect(src).toMatch(/<form[^>]*autoComplete="off"/);
  });
});
