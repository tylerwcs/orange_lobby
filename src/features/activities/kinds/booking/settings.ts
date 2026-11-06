import { readActivityPolicy, type ActivityPolicy } from "../../lib/activities";
import type { NewActivity } from "../../db/activities";
import { categoryValues, type FormReader } from "../form";

/** D837: `attendee_edit` on a booking is "change or cancel without asking", up to the session's start. */
export type BookingSettings = ActivityPolicy & { attendee_edit: boolean };

/**
 * A booking's Setup form and its add form (D420). No `is_open`: see `readActivityPolicy` -
 * that column is the Open switch's alone, and only `newBooking` sets a first value.
 */
export function readBookingSettings(form: FormReader): BookingSettings {
  return {
    ...readActivityPolicy({
      name: form.text("name"),
      description: form.text("description"),
      required: form.checked("required"),
      max_per_attendee: form.text("max_per_attendee"),
      categories: categoryValues(form),
    }),
    attendee_edit: form.checked("attendee_edit"),
  };
}

/** `questions` and `per_day` are the submission kind's (D178): empty and false are facts about a booking. */
export function newBooking(settings: BookingSettings, isOpen: boolean): NewActivity {
  return { ...settings, kind: "booking", is_open: isOpen, questions: [], per_day: false };
}
