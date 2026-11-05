import { describe, it, expect } from "vitest";
import { bookingValues, defaultSources, fillVariables, needsBooking, readTemplate, sessionToRemind, sourceValue, type GraphTemplate } from "@/lib/whatsapp-templates";
import { bookedActivityId } from "@/lib/whatsapp-targets";

// Shaped like Meta's own answer for the approved event template.
const portal: GraphTemplate = {
  name: "ecphub_portallink",
  status: "APPROVED",
  category: "UTILITY",
  language: "en",
  parameter_format: "POSITIONAL",
  components: [
    { type: "BODY", text: "Hi {{1}}, your registration for {{2}} on {{3}} is confirmed." },
    { type: "FOOTER", text: "Ecopia Events" },
    { type: "BUTTONS", buttons: [{ type: "URL", text: "Visit website", url: "https://ecphub.vercel.app/a/{{1}}" }] },
  ],
};

describe("readTemplate", () => {
  it("reads an approved event template", () => {
    expect(readTemplate(portal)).toEqual({
      name: "ecphub_portallink",
      language: "en",
      category: "UTILITY",
      header: null,
      body: "Hi {{1}}, your registration for {{2}} on {{3}} is confirmed.",
      footer: "Ecopia Events",
      variables: 3,
      button: { text: "Visit website", urlPrefix: "https://ecphub.vercel.app/a/" },
    });
  });
  it("keeps a template with no variables and no button", () => {
    const hello = readTemplate({ name: "hello_world", status: "APPROVED", language: "en_US", components: [
      { type: "HEADER", format: "TEXT", text: "Hello World" }, { type: "BODY", text: "Welcome!" },
    ] });
    expect(hello).toMatchObject({ header: "Hello World", variables: 0, button: null });
  });
  it("leaves out what Meta would not take or this app cannot fill", () => {
    expect(readTemplate({ ...portal, status: "REJECTED" })).toBeNull();
    expect(readTemplate({ ...portal, parameter_format: "NAMED" })).toBeNull();
    expect(readTemplate({ ...portal, components: [{ type: "HEADER", format: "TEXT", text: "Hi {{1}}" }, ...portal.components] })).toBeNull();
    expect(readTemplate({ ...portal, components: [{ type: "HEADER", format: "IMAGE" }, ...portal.components] })).toBeNull();
    // The rejected first draft: a variable that is not the tail of the link.
    expect(readTemplate({ ...portal, components: [portal.components[0], { type: "BUTTONS", buttons: [{ type: "URL", text: "Go", url: "https://x/{{1}}/y" }] }] })).toBeNull();
    expect(readTemplate({ ...portal, components: [portal.components[0], { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Yes" }] }] })).toBeNull();
  });
});

describe("variables", () => {
  it("defaults to name, event, dates, then custom text", () => {
    expect(defaultSources(0)).toEqual([]);
    expect(defaultSources(2)).toEqual(["attendee_name", "event_name"]);
    expect(defaultSources(4)).toEqual(["attendee_name", "event_name", "event_dates", "custom"]);
  });
  it("fills each source from the attendee and the event", () => {
    const v = { attendeeName: "Aina", eventName: "KOM 2026", eventDates: "30 Sep 2026", venue: "Marriott" };
    expect(sourceValue("attendee_name", v, "")).toBe("Aina");
    expect(sourceValue("venue", v, "")).toBe("Marriott");
    expect(sourceValue("custom", v, "Bring ID")).toBe("Bring ID");
  });
  it("replaces {{n}} in order, and shows a placeholder that has no value", () => {
    expect(fillVariables("Hi {{1}}, see you at {{2}}. {{1}}!", ["Aina", "KOM"])).toBe("Hi Aina, see you at KOM. Aina!");
    expect(fillVariables("Hi {{1}} on {{3}}", ["Aina", "x", ""])).toBe("Hi Aina on {{3}}");
  });
});

describe("session sources", () => {
  const s = (day: string, starts_at: string, location: string | null = "Hall 2") => ({ day, starts_at, location });
  const now = { date: "2026-11-08", time: "11:00" };

  it("reminds about the next session, or the last once all have begun", () => {
    expect(sessionToRemind([s("2026-11-09", "09:00"), s("2026-11-08", "10:30"), s("2026-11-08", "14:00")], now)).toEqual(s("2026-11-08", "14:00"));
    expect(sessionToRemind([s("2026-11-08", "11:00")], now)).toEqual(s("2026-11-08", "11:00"));
    expect(sessionToRemind([s("2026-11-07", "09:00"), s("2026-11-08", "10:30")], now)).toEqual(s("2026-11-08", "10:30"));
    expect(sessionToRemind([], now)).toBeNull();
  });
  it("reads the time after \"at\", and the place as set", () => {
    expect(bookingValues("Health Screening", s("2026-11-08", "10:30", "  Hall 2 "))).toEqual({ activity: "Health Screening", time: "10:30 on Sun 8 Nov", location: "Hall 2" });
    expect(bookingValues("Yoga", s("2026-11-08", "10:30", null))?.location).toBe("");
    expect(bookingValues("Yoga", null)).toBeNull();
  });
  it("fills from the person's booking, and empty without one", () => {
    const v = { attendeeName: "Aina", eventName: "KOM", eventDates: "", venue: "", booking: bookingValues("Yoga", s("2026-11-08", "10:30")) };
    expect(["session_activity", "session_time", "session_location"].map((k) => sourceValue(k as never, v, ""))).toEqual(["Yoga", "10:30 on Sun 8 Nov", "Hall 2"]);
    expect(sourceValue("session_time", { ...v, booking: null }, "")).toBe("");
  });
  it("needs a Booked for audience", () => {
    expect(needsBooking(["custom", "session_time"])).toBe(true);
    expect(needsBooking(["attendee_name", "venue"])).toBe(false);
    expect(bookedActivityId("booked:abc")).toBe("abc");
    expect(bookedActivityId("unbooked:abc")).toBeNull();
    expect(bookedActivityId("all")).toBeNull();
  });
});
