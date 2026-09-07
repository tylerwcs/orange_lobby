import { describe, it, expect } from "vitest";
import { extractToken, scanResultFields } from "@/lib/scan";
import type { Attendee, Event } from "@/lib/types";

describe("extractToken", () => {
  it("reads token from URL or bare string", () => {
    expect(extractToken("https://events.ecopiaevents.com/e/kom/a/abcdefghjkmn")).toBe("abcdefghjkmn");
    expect(extractToken("abcdefghjkmn")).toBe("abcdefghjkmn");
    expect(extractToken("https://x/e/kom")).toBeNull();
    expect(extractToken("hello world")).toBeNull();
  });
});

describe("scanResultFields", () => {
  it("returns fixed fields then configured extras", () => {
    const a = { name: "Ann", company: "Ecopia", category: "VIP", table_no: "3", seat_no: null, extra: { Dietary: "Halal" }, phone: "012" } as unknown as Attendee;
    const e = { scan_extra_fields: ["Dietary", "phone"] } as Event;
    expect(scanResultFields(a, e)).toEqual([
      { label: "Company", value: "Ecopia" }, { label: "Category", value: "VIP" }, { label: "Table", value: "3" },
      { label: "Dietary", value: "Halal" }, { label: "phone", value: "012" },
    ]);
  });
});
