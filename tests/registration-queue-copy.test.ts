import { describe, it, expect } from "vitest";
import { queueCopy, QUEUE_COPY_DEFAULTS } from "@/features/registration-queue/lib/copy";

const none = {
  registration_full_title: null, registration_full_message: null,
  registration_waiting_title: null, registration_waiting_message: null,
  registration_pending_title: null, registration_pending_message: null,
};

describe("queueCopy (D708)", () => {
  it("uses the defaults when the organiser has written nothing", () => {
    expect(queueCopy(none)).toEqual(QUEUE_COPY_DEFAULTS);
    expect(queueCopy({})).toEqual(QUEUE_COPY_DEFAULTS);
  });

  it("says nothing about every place being taken, and the waiting page gives no number", () => {
    expect(QUEUE_COPY_DEFAULTS.fullMessage).not.toMatch(/every place/i);
    expect(QUEUE_COPY_DEFAULTS.waitingMessage).toBe("We have received your registration. We will inform you once a slot opens up.");
  });

  it("uses the organiser's wording, trimmed, field by field", () => {
    const c = queueCopy({ ...none, registration_waiting_title: "  Hang tight  ", registration_full_message: "Sorry, we're full.\nJoin below." });
    expect(c.waitingTitle).toBe("Hang tight");
    expect(c.fullMessage).toBe("Sorry, we're full.\nJoin below.");
    expect(c.fullTitle).toBe(QUEUE_COPY_DEFAULTS.fullTitle);
  });

  it("treats a blank or spaces-only field as not written", () => {
    expect(queueCopy({ ...none, registration_pending_title: "   " }).pendingTitle).toBe(QUEUE_COPY_DEFAULTS.pendingTitle);
  });
});
