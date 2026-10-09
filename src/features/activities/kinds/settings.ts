import type { NewActivity } from "@/lib/db/activities";
import type { ActivityKind } from "@/lib/types";
import { formReader, type FormReader } from "./form";
import { newBooking, readBookingSettings, type BookingSettings } from "./booking/settings";
import { newSubmission, readSubmissionSettings, type SubmissionSettings } from "./submission/settings";
import { newPassport, readPassportSettingsForm, type PassportSettings } from "./passport/settings";

/** What each kind's Setup form saves (D420). Indexed by ActivityKind below, so a new kind needs its own. */
export type SettingsFor = { booking: BookingSettings; submission: SubmissionSettings; passport: PassportSettings };

/** What a reader may need beyond the form: a passport's target is bounded by the booths it has. */
export type SettingsContext = { boothCount: number | null };

type KindSettings<K extends ActivityKind> = {
  read(form: FormReader, ctx: SettingsContext): SettingsFor[K];
  /** The create payload: the settings plus what only creation sets (D420). */
  create(settings: SettingsFor[K], isOpen: boolean): NewActivity;
};

/** One reader per kind (D420): a kind added to ActivityKind does not build until it has one. */
export const KIND_SETTINGS: { [K in ActivityKind]: KindSettings<K> } = {
  booking: { read: (form) => readBookingSettings(form), create: newBooking },
  submission: { read: (form) => readSubmissionSettings(form), create: newSubmission },
  passport: { read: (form, ctx) => readPassportSettingsForm(form, ctx.boothCount), create: newPassport },
};

export type SettingsResult<K extends ActivityKind> = { ok: true; settings: SettingsFor[K] } | { ok: false; error: string };

/**
 * One kind's settings from its posted form, or the sentence that refuses them. Every reader
 * throws the organiser's sentence; this turns it into a value, so every add and save action
 * flashes it the same way rather than one of them showing an error page.
 */
export function readSettings<K extends ActivityKind>(kind: K, fd: FormData, ctx: SettingsContext = { boothCount: null }): SettingsResult<K> {
  try {
    return { ok: true, settings: KIND_SETTINGS[kind].read(formReader(fd), ctx) };
  } catch (e) {
    if (e instanceof Error) return { ok: false, error: e.message };
    throw e;
  }
}

export function newActivityFrom<K extends ActivityKind>(kind: K, settings: SettingsFor[K], isOpen: boolean): NewActivity {
  return KIND_SETTINGS[kind].create(settings, isOpen);
}
