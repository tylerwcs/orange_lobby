import { describe, expect, it } from "vitest";
import { dueCutoff, groupByEvent, pendingPhrase, parseAlertNumbers, cronAuthorised } from "@/lib/committee-reminders";

describe("dueCutoff", () => {
  it("is exactly an hour before now", () => {
    expect(dueCutoff(new Date("2026-09-30T03:00:00.000Z"))).toBe("2026-09-30T02:00:00.000Z");
  });
});

describe("groupByEvent", () => {
  it("collects request ids under their event, keeping order", () => {
    const g = groupByEvent([{ id: "r1", event_id: "e1" }, { id: "r2", event_id: "e2" }, { id: "r3", event_id: "e1" }]);
    expect([...g.entries()]).toEqual([["e1", ["r1", "r3"]], ["e2", ["r2"]]]);
  });
});

describe("pendingPhrase", () => {
  it("counts in words the template reads naturally", () => {
    expect(pendingPhrase(1)).toBe("1 booking change request");
    expect(pendingPhrase(3)).toBe("3 booking change requests");
  });
});

describe("parseAlertNumbers", () => {
  it("normalises each line, drops blanks and repeats", () => {
    expect(parseAlertNumbers("012-345 6789\n\n+60 12 345 6789\n0198765432 ")).toEqual({ numbers: ["60123456789", "60198765432"], bad: [] });
  });
  it("names every line it cannot read", () => {
    expect(parseAlertNumbers("0123456789\nabc\n+65 8123 4567")).toEqual({ numbers: ["60123456789"], bad: ["abc", "+65 8123 4567"] });
  });
});

describe("cronAuthorised", () => {
  it("accepts only the exact bearer secret", () => {
    expect(cronAuthorised("Bearer s3cret", "s3cret")).toBe(true);
    expect(cronAuthorised("Bearer wrong", "s3cret")).toBe(false);
    expect(cronAuthorised(null, "s3cret")).toBe(false);
  });
  it("refuses everything when no secret is configured", () => {
    expect(cronAuthorised("Bearer ", undefined)).toBe(false);
    expect(cronAuthorised("Bearer undefined", undefined)).toBe(false);
  });
});
