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
    const a = { name: "Ann", company: "Ecopia", category: "VIP", table_no: "3", extra: { Dietary: "Halal" }, phone: "012" } as unknown as Attendee;
    const e = { scan_extra_fields: ["Dietary", "phone"] } as Event;
    expect(scanResultFields(a, e)).toEqual([
      { label: "Company", value: "Ecopia" }, { label: "Category", value: "VIP" }, { label: "Table", value: "3" },
      { label: "Dietary", value: "Halal" }, { label: "phone", value: "012" },
    ]);
  });

  it("finds a defined column named by its label, whose storage key is the slug", () => {
    const a = { name: "Ann", company: null, category: null, table_no: null, extra: { room_no: "12A" } } as unknown as Attendee;
    const e = { scan_extra_fields: ["Room no"], attendee_fields: [{ key: "room_no", label: "Room no", type: "text" }] } as Event;
    expect(scanResultFields(a, e).at(-1)).toEqual({ label: "Room no", value: "12A" });
  });

  it("leaves a configured name that matches nothing as a blank row rather than dropping it", () => {
    const a = { name: "Ann", company: null, category: null, table_no: null, extra: {} } as unknown as Attendee;
    const e = { scan_extra_fields: ["Nothing"], attendee_fields: [] } as unknown as Event;
    expect(scanResultFields(a, e).at(-1)).toEqual({ label: "Nothing", value: "" });
  });
});

import { describeCameraError } from "@/lib/scan";

describe("describeCameraError", () => {
  it("explains permission denial with a recovery step", () => {
    const d = describeCameraError(new DOMException("Permission denied", "NotAllowedError"));
    expect(d.title).toBe("Camera blocked");
    expect(d.hint).toMatch(/Allow camera/);
  });
  it("handles missing and busy cameras and unknown errors", () => {
    expect(describeCameraError({ name: "NotFoundError" }).title).toBe("No camera found");
    expect(describeCameraError({ name: "NotReadableError" }).title).toBe("Camera is in use");
    expect(describeCameraError("Error getting userMedia, error = NotAllowedError: Permission denied").title).toBe("Camera blocked");
    expect(describeCameraError(new Error("boom")).title).toBe("Camera unavailable");
  });
});
