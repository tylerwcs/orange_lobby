import { describe, expect, it } from "vitest";
import { canSubmit, capSummary } from "@/lib/forms";
import type { Form, FormSubmission } from "@/lib/types";

const form = (over: Partial<Form> = {}): Form => ({
  id: "f1", org_id: "o", event_id: "e", name: "Daily check-in", description: null,
  questions: [], submissions_open: true, categories: null,
  max_per_attendee: null, per_day: false, sort_order: 0, created_at: "2026-09-01T00:00:00Z", ...over,
});
const sub = (day: string): FormSubmission => ({
  id: `s-${day}`, event_id: "e", form_id: "f1", attendee_id: "a1", answers: {},
  submitted_on: day, status: "submitted", per_day: true, created_at: `${day}T01:00:00Z`,
});
const TODAY = "2026-09-28";

describe("canSubmit", () => {
  it("lets an eligible attendee submit to an open form", () => {
    expect(canSubmit(form(), [], null, TODAY)).toEqual({ can: true, reason: "ok", used: 0 });
  });

  it("refuses a closed form", () => {
    expect(canSubmit(form({ submissions_open: false }), [], null, TODAY).reason).toBe("closed");
  });

  it("refuses an attendee outside the form's categories", () => {
    expect(canSubmit(form({ categories: ["VIP"] }), [], "Delegate", TODAY).reason).toBe("ineligible");
  });

  it("lets a matching category in, ignoring case and spaces", () => {
    expect(canSubmit(form({ categories: ["VIP"] }), [], " vip ", TODAY).can).toBe(true);
  });

  it("treats no categories as everyone", () => {
    expect(canSubmit(form({ categories: [] }), [], null, TODAY).can).toBe(true);
  });

  it("refuses once the total cap is reached", () => {
    const r = canSubmit(form({ max_per_attendee: 2 }), [sub("2026-09-26"), sub("2026-09-27")], null, TODAY);
    expect(r).toEqual({ can: false, reason: "limit", used: 2 });
  });

  it("allows the last one under the cap", () => {
    expect(canSubmit(form({ max_per_attendee: 2 }), [sub("2026-09-26")], null, TODAY).can).toBe(true);
  });

  // D171: per_day is a second dial, not a scoping of the cap.
  it("refuses a second submission on the same day to a per_day form", () => {
    const r = canSubmit(form({ per_day: true }), [sub(TODAY)], null, TODAY);
    expect(r).toEqual({ can: false, reason: "today", used: 1 });
  });

  it("allows tomorrow's submission to a per_day form", () => {
    expect(canSubmit(form({ per_day: true }), [sub("2026-09-27")], null, TODAY).can).toBe(true);
  });

  it("applies the total cap to a per_day form as well", () => {
    const r = canSubmit(form({ per_day: true, max_per_attendee: 2 }), [sub("2026-09-26"), sub("2026-09-27")], null, TODAY);
    expect(r.reason).toBe("limit");
  });

  // Closed beats everything: an organiser who shut the form is not asking about caps.
  it("reports closed before any other reason", () => {
    const r = canSubmit(form({ submissions_open: false, categories: ["VIP"] }), [sub(TODAY)], "Delegate", TODAY);
    expect(r.reason).toBe("closed");
  });
});

describe("capSummary", () => {
  it("says unlimited when there is no cap and no daily rule", () => {
    expect(capSummary(form())).toBe("Unlimited");
  });
  it("says once a day for a per_day form with no total", () => {
    expect(capSummary(form({ per_day: true }))).toBe("Once a day");
  });
  it("names both dials when a per_day form also has a total", () => {
    expect(capSummary(form({ per_day: true, max_per_attendee: 5 }))).toBe("Once a day, up to 5");
  });
  it("says once for a form capped at one", () => {
    expect(capSummary(form({ max_per_attendee: 1 }))).toBe("Once");
  });
  it("names the total for a capped form", () => {
    expect(capSummary(form({ max_per_attendee: 5 }))).toBe("Up to 5");
  });
});
