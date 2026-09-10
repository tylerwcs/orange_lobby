import { describe, it, expect } from "vitest";
import { pickLandingEvent } from "@/lib/landing";
import type { Event, EventStatus } from "@/lib/types";

const ev = (id: string, status: EventStatus, starts_on: string | null): Event =>
  ({ id, status, starts_on } as unknown as Event);

describe("pickLandingEvent", () => {
  it("returns null when nothing is live", () => {
    expect(pickLandingEvent([])).toBeNull();
    expect(pickLandingEvent([ev("e1", "draft", "2026-09-30"), ev("e2", "archived", "2026-01-01")])).toBeNull();
  });

  it("ignores draft and archived events", () => {
    expect(pickLandingEvent([ev("e1", "draft", "2027-01-01"), ev("e2", "live", "2026-09-30")])?.id).toBe("e2");
  });

  it("prefers the latest starts_on", () => {
    expect(pickLandingEvent([ev("e1", "live", "2026-01-01"), ev("e2", "live", "2026-09-30")])?.id).toBe("e2");
  });

  it("sorts events with no start date last", () => {
    expect(pickLandingEvent([ev("e1", "live", null), ev("e2", "live", "2026-09-30")])?.id).toBe("e2");
  });

  it("breaks ties by keeping input order, which listEvents returns newest-created first", () => {
    expect(pickLandingEvent([ev("newer", "live", "2026-09-30"), ev("older", "live", "2026-09-30")])?.id).toBe("newer");
  });
});
