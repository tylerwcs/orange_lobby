import { describe, it, expect } from "vitest";
import { splitAudience } from "@/lib/whatsapp-audience";
import type { AttendeeField } from "@/lib/attendee-fields";

const PHONE: AttendeeField[] = [{ key: "phone", label: "Mobile", type: "phone" }];
const a = (id: string, name: string, extra: Record<string, string>) => ({ id, name, extra });

describe("splitAudience", () => {
  it("normalises the numbers it can read and keeps the rest back", () => {
    const { recipients, unusable } = splitAudience(
      [a("1", "Lim Hock Cheng", { phone: "012-345 6789" }), a("2", "Siti Aminah", { phone: "n/a" })],
      PHONE,
    );
    expect(recipients).toEqual([{ attendee: expect.objectContaining({ id: "1" }), to: "60123456789" }]);
    expect(unusable.map((u) => u.attendee.id)).toEqual(["2"]);
  });

  it("says what the unreadable value actually was, so the sheet can be fixed", () => {
    const { unusable } = splitAudience([a("2", "Siti Aminah", { phone: "n/a" })], PHONE);
    expect(unusable[0].reason).toContain("n/a");
  });

  it("distinguishes a blank number from an unreadable one", () => {
    const { unusable } = splitAudience([a("3", "Raj Kumar", { phone: "  " })], PHONE);
    expect(unusable[0].reason).toMatch(/no (mobile|number)/i);
    expect(unusable[0].reason).not.toContain("could not");
  });

  it("reads the event's own phone column, whatever it named the key", () => {
    const fields: AttendeeField[] = [{ key: "hp_no", label: "HP No", type: "phone" }];
    const { recipients } = splitAudience([a("4", "Tan Wei Ming", { hp_no: "012-345 6789" })], fields);
    expect(recipients[0].to).toBe("60123456789");
  });

  it("holds everyone back when the event collects no phone at all", () => {
    const fields: AttendeeField[] = [{ key: "company", label: "Company", type: "text" }];
    const { recipients, unusable } = splitAudience([a("5", "Nurul", { company: "Ecopia" })], fields);
    expect(recipients).toEqual([]);
    expect(unusable).toHaveLength(1);
    expect(unusable[0].reason).toMatch(/no phone column/i);
  });
});
