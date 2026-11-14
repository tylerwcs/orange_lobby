import { describe, expect, it } from "vitest";
import {
  formatPlayHours, hoursState, hoursText, klClock, klDay, klDayStart, klMinute, parsePerDay, parsePlayHours,
} from "@/features/qualifier/hours";

const H = [0, 600, 720, 840, 1140, 1440];
const at = (hhmm: string) => Date.parse(`2026-11-16T${hhmm}:00+08:00`);

describe("parsePlayHours (D908)", () => {
  it("reads pairs of 24-hour times as minutes of the day", () => {
    expect(parsePlayHours("00:00-10:00, 12:00-14:00, 19:00-24:00")).toEqual(H);
    expect(parsePlayHours("12:00 - 14:00")).toEqual([720, 840]);
    expect(parsePlayHours("9:30-10:00")).toEqual([570, 600]);
  });
  it("blank means any time", () => {
    expect(parsePlayHours("  ")).toBeNull();
  });
  it("refuses what isn't ascending, separate pairs inside one day", () => {
    for (const bad of ["10:00-09:00", "12:00-14:00, 13:00-15:00", "25:00-26:00", "noon", "10:00-10:00",
      "19:00-24:00, 00:00-10:00", "12:60-13:00", "24:30-24:40", "12:00-14:00,"]) {
      expect(parsePlayHours(bad), bad).toBe("invalid");
    }
  });
  it("formats back to what was typed", () => {
    expect(formatPlayHours(H)).toBe("00:00-10:00, 12:00-14:00, 19:00-24:00");
    expect(formatPlayHours(null)).toBe("");
  });
});

describe("hoursText", () => {
  it("says before, between and after in 12-hour time", () => {
    expect(hoursText(H)).toBe("before 10:00 am, 12:00 pm – 2:00 pm, after 7:00 pm");
    expect(hoursText([720, 840])).toBe("12:00 pm – 2:00 pm");
    expect(hoursText([0, 1440])).toBe("at any time");
  });
});

describe("hoursState", () => {
  it("is open inside a pair; the end is exclusive", () => {
    expect(hoursState(H, at("09:59"))).toEqual({ open: true });
    expect(hoursState(H, at("10:00"))).toEqual({ open: false, opensAt: at("12:00") });
    expect(hoursState(H, at("13:59"))).toEqual({ open: true });
    expect(hoursState(H, at("14:00"))).toEqual({ open: false, opensAt: at("19:00") });
    expect(hoursState(H, at("23:59"))).toEqual({ open: true });
  });
  it("after the last pair, opens tomorrow", () => {
    expect(hoursState([720, 840], at("15:00"))).toEqual({ open: false, opensAt: Date.parse("2026-11-17T12:00:00+08:00") });
  });
  it("no hours is always open", () => {
    expect(hoursState(null, at("15:00"))).toEqual({ open: true });
    expect(hoursState([], at("15:00"))).toEqual({ open: true });
  });
});

describe("the Malaysia day", () => {
  it("is UTC+8", () => {
    expect(klDay(Date.parse("2026-11-16T16:30:00Z"))).toBe("2026-11-17");
    expect(klDay(Date.parse("2026-11-16T15:59:59Z"))).toBe("2026-11-16");
    expect(klDayStart(at("15:00"))).toBe(at("00:00"));
    expect(klMinute(at("19:05"))).toBe(1145);
  });
  it("prints a clock time", () => {
    expect(klClock(at("12:00"))).toBe("12:00 pm");
    expect(klClock(at("00:00"))).toBe("12:00 am");
    expect(klClock(at("19:05"))).toBe("7:05 pm");
  });
});

describe("parsePerDay (D910)", () => {
  it("blank is no limit, 0 to 99 a number, the rest invalid", () => {
    expect(parsePerDay("")).toBeNull();
    expect(parsePerDay(" 3 ")).toBe(3);
    expect(parsePerDay("0")).toBe(0);
    for (const bad of ["100", "-1", "1.5", "x", "1e1"]) expect(parsePerDay(bad), bad).toBe("invalid");
  });
});
