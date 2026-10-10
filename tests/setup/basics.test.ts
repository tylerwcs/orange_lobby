import { describe, expect, it } from "vitest";
import {
  basicsChanges, basicsComplete, basicsErrors, basicsFromEvent, basicsMissing, basicsPatch, blankBasics, sanitizeBasics,
  type BasicsAnswers,
} from "@/features/setup/sections/basics";

const full = (over: Partial<BasicsAnswers> = {}): BasicsAnswers => ({
  ...blankBasics(),
  name: "KOM 2027", starts_on: "2027-01-10", ends_on: "2027-01-11", venue_name: "Sunway Pyramid",
  primary_color: "#0EA5E9",
  ...over,
});

const event = {
  name: "Old name", starts_on: "2026-12-01", ends_on: "2026-12-02", venue_name: "Old venue", primary_color: "#F97316",
  logo_url: "https://x.supabase.co/storage/v1/object/public/event-media/o/e/logo-1.png", banner_url: null,
  committee_alert_numbers: ["60123456789"],
};

describe("blank, fromEvent, sanitize", () => {
  it("starts blank with the default colour", () => {
    expect(blankBasics()).toMatchObject({ name: "", primary_color: "#F97316", committee_numbers: "" });
  });
  it("prefills from the live event, committee numbers as +60 lines", () => {
    expect(basicsFromEvent(event)).toMatchObject({ name: "Old name", logo_url: event.logo_url, banner_url: "", committee_numbers: "+60123456789" });
  });
  it("keeps only known fields, as strings, cut to their limits", () => {
    const s = sanitizeBasics({ name: "x".repeat(500), evil: "1", starts_on: 20270110, notes: null });
    expect(s.name).toHaveLength(120);
    expect("evil" in s).toBe(false);
    expect(s.starts_on).toBe("20270110");
    expect(s.notes).toBe("");
  });
  it("reads anything that isn't an object as blank", () => {
    expect(sanitizeBasics("nope")).toEqual(blankBasics());
  });
});

describe("errors, missing, complete", () => {
  it("passes a complete answer set", () => {
    expect(basicsErrors(full())).toEqual({});
    expect(basicsMissing(full())).toEqual([]);
    expect(basicsComplete(full())).toBe(true);
  });
  it("lists the required fields still empty", () => {
    expect(basicsMissing(blankBasics())).toEqual(["name", "starts_on", "ends_on", "venue_name"]);
    expect(basicsComplete(blankBasics())).toBe(false);
  });
  it("refuses a last day before the first", () => {
    expect(basicsErrors(full({ ends_on: "2027-01-09" })).ends_on).toBe("The last day can't be before the first.");
  });
  it("refuses a date that isn't a date", () => {
    expect(basicsErrors(full({ starts_on: "2027-02-30" })).starts_on).toBe("Pick a date.");
  });
  it("refuses a colour that isn't #RRGGBB", () => {
    expect(basicsErrors(full({ primary_color: "orange" })).primary_color).toBe("Use a colour like #F97316.");
  });
  it("names committee numbers it can't read", () => {
    expect(basicsErrors(full({ committee_numbers: "012-345 6789\nabc" })).committee_numbers).toBe("These can't be read as Malaysian mobile numbers: abc");
  });
  it("is not complete while there is an error", () => {
    expect(basicsComplete(full({ primary_color: "red" }))).toBe(false);
  });
});

describe("basicsChanges (D449)", () => {
  it("lists only fields that differ from the live event, trimmed", () => {
    const live = basicsFromEvent(event);
    const changes = basicsChanges({ ...live, name: "New name ", venue_name: "Old venue" }, live);
    expect(changes.map((c) => c.field)).toEqual(["name"]);
    expect(changes[0]).toMatchObject({ label: "Event name", before: "Old name", after: "New name", image: false, infoOnly: false });
  });
  it("marks images, and lists categories and notes as info only when filled", () => {
    const live = basicsFromEvent(event);
    const changes = basicsChanges({ ...live, banner_url: "https://b", categories: "Staff\nVIP", notes: "" }, live);
    expect(changes.find((c) => c.field === "banner_url")?.image).toBe(true);
    expect(changes.find((c) => c.field === "categories")?.infoOnly).toBe(true);
    expect(changes.some((c) => c.field === "notes")).toBe(false);
  });
});

describe("basicsPatch (D450)", () => {
  const live = basicsFromEvent(event);
  it("first apply writes what differs from the live event", () => {
    expect(basicsPatch(full(), live)).toEqual({
      name: "KOM 2027", starts_on: "2027-01-10", ends_on: "2027-01-11", venue_name: "Sunway Pyramid",
      primary_color: "#0EA5E9", logo_url: null, committee_alert_numbers: [],
    });
  });
  it("first apply clears a prefilled field the organiser emptied", () => {
    const base = { ...live, banner_url: "https://b" };
    expect(basicsPatch({ ...base, banner_url: "" }, base)).toEqual({ banner_url: null });
  });
  it("first apply writes nothing when the organiser changed nothing", () => {
    expect(basicsPatch(live, live)).toEqual({});
  });
  it("a later apply writes only what the organiser changed since the last apply", () => {
    const applied = full();
    expect(basicsPatch(full({ venue_name: "MITEC" }), applied)).toEqual({ venue_name: "MITEC" });
  });
  it("writes nothing when nothing changed, so an admin's own edit survives", () => {
    expect(basicsPatch(full(), full())).toEqual({});
  });
  it("clearing an optional field writes null", () => {
    expect(basicsPatch(full({ banner_url: "" }), full({ banner_url: "https://b" }))).toEqual({ banner_url: null });
  });
  it("turns committee lines into the stored +60-less list", () => {
    expect(basicsPatch(full({ committee_numbers: "012-345 6789\n+60 19 876 5432\n012-345 6789" }), blankBasics()).committee_alert_numbers)
      .toEqual(["60123456789", "60198765432"]);
  });
  it("never writes categories or notes", () => {
    expect(basicsPatch(full({ categories: "Staff", notes: "Hi" }), full())).toEqual({});
  });
});
