import { describe, it, expect } from "vitest";
import { defaultSources, fillVariables, readTemplate, sourceValue, type GraphTemplate } from "@/lib/whatsapp-templates";

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
