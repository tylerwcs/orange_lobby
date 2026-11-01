import { MAX_QUESTIONS, questionsFromForm } from "@/lib/questions-form";
import { REGISTRATION_QUESTION_TYPES } from "@/lib/registration";
import { normaliseRegistrationForm, STANDARD_COUNT } from "@/lib/registration-standard";
import { parseDisplayName } from "@/lib/event-name";
import { localInputToIso } from "@/lib/time";
import { cleanRichText } from "@/lib/rich-text";
import { meGroups, meHiddenFromForm } from "@/lib/me-page";
import { themeFromForm } from "@/features/theme";
import { parseLimit } from "@/features/registration-queue/client";
import type { Event } from "@/lib/types";

/**
 * D778: what each Settings tab writes. The tabs used to share one form and one save, so a tab
 * the admin never opened still posted its fields; now each tab posts, and writes, only its own.
 * The three column lists are disjoint, and between them they are every column the old single
 * save wrote.
 */
export const EVENT_TAB_COLUMNS = ["name", "display_name", "display_name_in_bar", "venue_name", "starts_on", "ends_on", "coming_soon_message"] as const;
export const PORTAL_LOOK_COLUMNS = ["logo_url", "banner_url", "primary_color", "theme", "language_switch", "me_hidden"] as const;
export const REGISTRATION_COLUMNS = [
  "registration_open", "registration_closes_at", "self_cancel", "self_cancel_closes_at", "registration_limit",
  "registration_needs_approval", "registration_intro", "registration_terms", "registration_done_title",
  "registration_done_message", "registration_done_page", "registration_done_qr", "after_register_activity_id", "registration_full_title", "registration_full_message",
  "registration_waiting_title", "registration_waiting_message", "registration_pending_title",
  "registration_pending_message", "registration_banner_url", "registration_footer_url", "registration_questions",
] as const;

const str = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};

/** A blank name is left as it is (`undefined`), never written. */
export type EventTabPatch = Omit<Pick<Event, (typeof EVENT_TAB_COLUMNS)[number]>, "name"> & { name: string | undefined };

export function eventTabPatch(fd: FormData, ev: Event): EventTabPatch {
  return {
    name: str(fd, "name") ?? undefined,
    display_name: parseDisplayName(str(fd, "display_name"), str(fd, "name") ?? ev.name), // D633
    display_name_in_bar: fd.get("display_name_in_bar") === "on", // D635
    venue_name: str(fd, "venue_name"),
    starts_on: str(fd, "starts_on"),
    ends_on: str(fd, "ends_on"),
    coming_soon_message: str(fd, "coming_soon_message"), // D617
  };
}

/**
 * `images` are the urls after any upload or removal (the upload itself stays in the action).
 * With the Language add-on off the form has no switch, so the stored value is kept.
 */
export function portalLookPatch(
  fd: FormData,
  ev: Event,
  images: { logo_url: string | null; banner_url: string | null },
  languageOn: boolean,
): Pick<Event, (typeof PORTAL_LOOK_COLUMNS)[number]> {
  return {
    logo_url: images.logo_url,
    banner_url: images.banner_url,
    primary_color: str(fd, "primary_color") ?? "#F97316",
    theme: themeFromForm(fd), // D622
    language_switch: languageOn ? fd.get("language_switch") === "on" : (ev.language_switch ?? false), // D738
    me_hidden: meHiddenFromForm(fd.getAll("me_shown").map(String), meGroups(ev)), // D536
  };
}

/**
 * Throws an Error with the message to show the admin for a bad question form or a bad limit.
 * `ev` is unused today; it keeps the three patch signatures alike.
 */
export function registrationPatch(
  fd: FormData,
  ev: Event,
  images: { registration_banner_url: string | null; registration_footer_url: string | null },
): Pick<Event, (typeof REGISTRATION_COLUMNS)[number]> {
  void ev;
  // The list carries the four standard questions too (name, email, mobile, department), which
  // do not count towards the organiser's own MAX_QUESTIONS.
  const questions = normaliseRegistrationForm(questionsFromForm(
    (k) => { const v = fd.get(k); return typeof v === "string" ? v : null; },
    REGISTRATION_QUESTION_TYPES, MAX_QUESTIONS + STANDARD_COUNT,
  ));
  // D677: blank is no limit; anything else must be a whole number above 0, not quietly dropped.
  const limitRaw = str(fd, "registration_limit");
  const registrationLimit = parseLimit(limitRaw);
  if (limitRaw !== null && registrationLimit === null) {
    throw new Error("Limit registrations to a whole number above 0, or leave it blank for no limit.");
  }
  return {
    registration_open: fd.get("registration_open") === "on",
    registration_closes_at: localInputToIso(str(fd, "registration_closes_at")),
    // D583
    self_cancel: fd.get("self_cancel") === "on",
    self_cancel_closes_at: localInputToIso(str(fd, "self_cancel_closes_at")),
    registration_limit: registrationLimit, // D677
    registration_needs_approval: fd.get("registration_needs_approval") === "on", // D696
    registration_intro: str(fd, "registration_intro"),
    registration_terms: cleanRichText(str(fd, "registration_terms")),
    registration_done_title: str(fd, "registration_done_title"),
    registration_done_message: str(fd, "registration_done_message"),
    registration_done_page: fd.get("registration_done_page") === "on", // D634
    registration_done_qr: fd.get("registration_done_qr") === "on", // D804
    // D805: as chosen; the save action checks it is one of this event's activities.
    after_register_activity_id: str(fd, "after_register_activity_id"),
    // D708
    registration_full_title: str(fd, "registration_full_title"),
    registration_full_message: str(fd, "registration_full_message"),
    registration_waiting_title: str(fd, "registration_waiting_title"),
    registration_waiting_message: str(fd, "registration_waiting_message"),
    registration_pending_title: str(fd, "registration_pending_title"),
    registration_pending_message: str(fd, "registration_pending_message"),
    registration_banner_url: images.registration_banner_url, // D618
    registration_footer_url: images.registration_footer_url, // D720
    registration_questions: questions,
  };
}
