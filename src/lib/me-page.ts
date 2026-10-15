import { eventFields } from "@/lib/attendee-fields";
import type { Event } from "@/lib/types";

/**
 * What an organiser can hide on the attendee's Me page (D536). The name and avatar are not
 * here: it is the attendee's own profile, and a card with no name on it is no profile.
 *
 * The parts that are not attendee fields carry a ":" prefix, so an organiser column that
 * happens to be keyed "email" or "badge" can never be hidden by the built-in of that name.
 * Table stays under its field key - it is a field, shown as a badge on the card instead of a row.
 */
export const ME_CATEGORY = ":category";
export const ME_BADGE = ":badge";
export const ME_EMAIL = ":email";
export const ME_TABLE = "table_no";

export type MeItem = { key: string; label: string };
export type MeGroup = { title: string; items: MeItem[] };

/** Every answer field the "What you told us" card can list: all of them bar the table, which the card shows. */
export function meAnswerFields(e: Pick<Event, "registration_questions" | "attendee_fields">) {
  return eventFields(e.registration_questions, e.attendee_fields).filter((f) => f.key !== ME_TABLE);
}

/** The admin checklist, grouped the way the Me page's cards are. */
export function meGroups(e: Pick<Event, "registration_questions" | "attendee_fields">): MeGroup[] {
  const answers = meAnswerFields(e).map((f) => ({ key: f.key, label: f.label }));
  return [
    {
      title: "Profile card",
      items: [
        { key: ME_CATEGORY, label: "Category" },
        { key: ME_TABLE, label: "Table number" },
        { key: ME_BADGE, label: "Show my badge (their QR code)" },
      ],
    },
    { title: "Your details", items: [{ key: ME_EMAIL, label: "Email" }] },
    ...(answers.length ? [{ title: "What you told us", items: answers }] : []),
  ];
}

/**
 * The hidden list a save stores: every item on the checklist that was not ticked.
 *
 * Stored as what is hidden rather than what is shown, so a question added after the save
 * shows on the Me page by default instead of going missing until someone thinks to tick it.
 */
export function meHiddenFromForm(shown: string[], groups: MeGroup[]): string[] {
  const ticked = new Set(shown);
  return groups.flatMap((g) => g.items).map((i) => i.key).filter((k) => !ticked.has(k));
}

/** Read from the column; absent on a database that predates 0081, which hides nothing. */
export function parseMeHidden(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : [];
}
