import { fieldValue } from "@/lib/attendee-values";
import { toE164My } from "@/lib/phone";
import type { AttendeeField } from "@/lib/attendee-fields";

/**
 * Who a WhatsApp send can actually reach, and who it cannot.
 *
 * The second half is the point. A blast goes out once and cannot be recalled, so the organiser
 * has to see the rows that will be skipped — by name, with the value that defeated us — while
 * there is still time to fix the sheet. Everything here is pure so that list can be shown on
 * the admin screen before anything is sent, from exactly the same code that does the sending.
 */
export type AudienceAttendee = { id: string; name: string; extra: Record<string, string> };

export type Recipient<T extends AudienceAttendee> = { attendee: T; to: string };
export type Unusable<T extends AudienceAttendee> = { attendee: T; reason: string };

export type Audience<T extends AudienceAttendee> = {
  recipients: Recipient<T>[];
  unusable: Unusable<T>[];
  /** The field the numbers were read from, or null when the event collects no phone. */
  phoneKey: string | null;
};

export function splitAudience<T extends AudienceAttendee>(attendees: T[], fields: AttendeeField[]): Audience<T> {
  // An event names its own columns, so the key is whatever it called the phone — `phone` from
  // migration 0014, `hp_no` if somebody typed that. The type is the reliable part, not the key.
  const field = fields.find((f) => f.type === "phone");
  if (!field) {
    return {
      recipients: [],
      unusable: attendees.map((attendee) => ({ attendee, reason: "This event has no phone column" })),
      phoneKey: null,
    };
  }

  const recipients: Recipient<T>[] = [];
  const unusable: Unusable<T>[] = [];
  for (const attendee of attendees) {
    const raw = fieldValue(attendee, field.key);
    if (!raw) {
      unusable.push({ attendee, reason: `No ${field.label.toLowerCase()} on file` });
      continue;
    }
    const to = toE164My(raw);
    // Quoted, because the fix is to go and edit that exact cell in the masterlist.
    if (!to) unusable.push({ attendee, reason: `Could not read "${raw}" as a Malaysian number` });
    else recipients.push({ attendee, to });
  }
  return { recipients, unusable, phoneKey: field.key };
}
